"""
Lectura de bocetos en PDF e imagen con la API de Claude — RF-04.

El boceto se envía tal cual (el PDF como documento, la imagen como
imagen) junto con instrucciones sobre la notación de HEXtructure. La
respuesta se pide a través de una herramienta con esquema JSON fijo
(`registrar_bloques`): así el modelo no puede devolver texto libre y la
salida se valida con los mismos esquemas de Pydantic que el resto del
servicio.

Se llama a la API por HTTP con httpx, sin el SDK de Anthropic: es una
sola petición y así las pruebas la simulan igual que la llamada al
servicio de cálculo en la API principal.
"""

import base64

import httpx
from pydantic import ValidationError

from app.core.config import settings
from app.schemas.boceto import MAXIMO_ETIQUETA, BloqueDetectado, ResultadoInterpretacion

VERSION_API = "2023-06-01"
MAX_TOKENS = 4096

TIPOS_MEDIO = {"pdf": "application/pdf", "png": "image/png", "jpg": "image/jpeg"}

INSTRUCCIONES = """\
Eres un asistente técnico de HEXtructure S.A.S., fabricante de estructuras para plantas
fotovoltaicas sobre suelo. Recibes el boceto de una planta enviado por un cliente instalador
y debes identificar los bloques de paneles para calcular la estructura.

Notación de HEXtructure:
- Un bloque es una grilla rectangular de paneles iguales, montados sobre una misma estructura.
- L = paneles en el largo del bloque: la dirección del lado mayor del panel (la pendiente).
  Casi siempre es un número par pequeño (2, 4 o 6).
- A = paneles en el ancho del bloque: a lo largo de la fila, la dirección del lado menor del panel.
  Suele ser bastante mayor que L (por ejemplo 20 a 30).
- B = cuántos bloques idénticos (mismo L, mismo A y misma orientación) hay en la planta.
- Orientación "vertical" si las filas de A corren de arriba hacia abajo en el plano;
  "horizontal" si corren de izquierda a derecha.

Cómo leer el boceto:
- Cuenta los paneles de cada bloque en las dos direcciones. Si el boceto trae rótulos con medidas
  (por ejemplo "4x24" o "Bloque A x 12"), úsalos y verifícalos con el dibujo.
- Los números grandes dentro de los bloques suelen identificar inversores o grupos, no cantidades
  de paneles: no los uses como L ni como A.
- Ignora el contorno del terreno, caminos, cercas, rótulos, la rosa de los vientos y la carátula.
- Agrupa los bloques idénticos y devuelve un tipo por combinación de L, A y orientación.
- Indica tu confianza entre 0 y 1 por tipo. Si algo no se distingue bien (resolución baja,
  bloques cortados, paneles tapados por texto), baja la confianza y explícalo en las advertencias.

Registra el resultado únicamente con la herramienta registrar_bloques.
"""

HERRAMIENTA = {
    "name": "registrar_bloques",
    "description": "Registra los tipos de bloque identificados en el boceto.",
    "input_schema": {
        "type": "object",
        "properties": {
            "bloques": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "etiqueta": {
                            "type": "string",
                            "maxLength": MAXIMO_ETIQUETA,
                            "description": "Nombre corto del tipo en el boceto, si lo tiene (por ejemplo A o B2)",
                        },
                        "paneles_largo": {"type": "integer", "minimum": 1},
                        "paneles_ancho": {"type": "integer", "minimum": 1},
                        "repeticiones": {"type": "integer", "minimum": 1},
                        "orientacion": {"type": "string", "enum": ["vertical", "horizontal"]},
                        "confianza": {"type": "number", "minimum": 0, "maximum": 1},
                    },
                    "required": ["paneles_largo", "paneles_ancho", "repeticiones", "orientacion", "confianza"],
                },
            },
            "advertencias": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["bloques", "advertencias"],
    },
}


class IaNoConfigurada(RuntimeError):
    """Falta la clave de la API de Anthropic."""


class IaError(RuntimeError):
    """La API respondió con error o con un resultado inválido."""


def _contenido(formato: str, datos: bytes) -> dict:
    fuente = {"type": "base64", "media_type": TIPOS_MEDIO[formato], "data": base64.b64encode(datos).decode()}
    return {"type": "document" if formato == "pdf" else "image", "source": fuente}


def interpretar_con_ia(contenido: bytes, formato: str) -> ResultadoInterpretacion:
    if not settings.ANTHROPIC_API_KEY:
        raise IaNoConfigurada(
            "El análisis con IA no está configurado todavía: falta la clave de la API de Anthropic. "
            "Mientras tanto se pueden cargar bocetos en DXF."
        )

    cuerpo = {
        "model": settings.ANTHROPIC_MODEL,
        "max_tokens": MAX_TOKENS,
        "system": INSTRUCCIONES,
        "tools": [HERRAMIENTA],
        "tool_choice": {"type": "tool", "name": "registrar_bloques"},
        "messages": [
            {
                "role": "user",
                "content": [
                    _contenido(formato, contenido),
                    {"type": "text", "text": "Identifica los bloques de paneles de este boceto."},
                ],
            }
        ],
    }
    try:
        respuesta = httpx.post(
            settings.ANTHROPIC_URL,
            json=cuerpo,
            headers={
                "x-api-key": settings.ANTHROPIC_API_KEY,
                "anthropic-version": VERSION_API,
                "content-type": "application/json",
            },
            timeout=settings.ANTHROPIC_TIMEOUT_SEGUNDOS,
        )
    except httpx.TimeoutException as exc:
        raise IaError("El análisis con IA tardó demasiado. Intenta de nuevo o carga un archivo más liviano.") from exc
    except httpx.RequestError as exc:
        raise IaError("No se pudo conectar con el servicio de IA.") from exc

    if respuesta.status_code != 200:
        # El detalle de Anthropic puede incluir datos de la cuenta: no se reenvía al usuario
        raise IaError(f"El servicio de IA respondió con un error ({respuesta.status_code}).")

    try:
        bloques_crudos = next(
            parte["input"]
            for parte in respuesta.json().get("content", [])
            if parte.get("type") == "tool_use" and parte.get("name") == "registrar_bloques"
        )
        bloques = [BloqueDetectado(**b) for b in bloques_crudos.get("bloques", [])]
        advertencias = [str(a) for a in bloques_crudos.get("advertencias", [])]
    except (StopIteration, ValueError, TypeError, AttributeError, ValidationError) as exc:
        raise IaError("La IA devolvió un resultado que no se pudo interpretar. Intenta de nuevo.") from exc

    if not bloques:
        advertencias.append("La IA no identificó bloques de paneles en el boceto. Agrégalos a mano en la confirmación.")

    return ResultadoInterpretacion(formato=formato, metodo="ia", bloques=bloques, advertencias=advertencias)
