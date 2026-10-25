"""
Conteo de varillas en la foto de un lote con la API de Claude — RF-14.

El operario fotografía de frente el atado de varillas (bípode) y el modelo
cuenta los extremos circulares visibles. Igual que en la lectura de
bocetos, la respuesta se pide con una herramienta de esquema fijo
(`registrar_conteo`) para no depender de texto libre.

El resultado es una estimación: la confianza baja y las advertencias le
dicen al operario cuándo revisar a mano (sombras, varillas tapadas, foto
de lado). La cantidad que vale es la que él confirma.
"""

import base64

import httpx
from pydantic import ValidationError

from app.core.config import settings
from app.schemas.conteo import MAXIMO_VARILLAS, ResultadoConteo
from app.services.ia import VERSION_API, IaError, IaNoConfigurada

MAX_TOKENS = 1024
TIPOS_MEDIO = {"png": "image/png", "jpg": "image/jpeg"}

INSTRUCCIONES = """\
Eres un asistente de control de calidad de HEXtructure S.A.S., fabricante de estructuras
metálicas para plantas fotovoltaicas. Antes de despachar un lote, el operario fotografía de
frente un atado de varillas de acero galvanizado y necesita saber cuántas varillas contiene.

Cómo contar:
- Cada varilla se ve desde su extremo como un círculo (o elipse) metálico, del mismo diámetro
  que los demás. Cuenta cada extremo visible una sola vez.
- Recorre la foto por filas para no repetir ni saltarte extremos. Los atados son grandes:
  pueden tener cientos de varillas.
- No cuentes tornillos, placas, sombras, reflejos, el fondo ni varillas que se ven de lado.
- Si parte del atado está fuera de la foto, tapada, desenfocada o en sombra, cuenta lo visible,
  baja la confianza y explícalo en las advertencias.
- Si la foto no muestra extremos de varillas, devuelve cantidad 0, confianza 0 y explica por qué.

Registra el resultado únicamente con la herramienta registrar_conteo.
"""

HERRAMIENTA = {
    "name": "registrar_conteo",
    "description": "Registra cuántos extremos de varilla se ven en la foto.",
    "input_schema": {
        "type": "object",
        "properties": {
            "cantidad": {"type": "integer", "minimum": 0, "maximum": MAXIMO_VARILLAS},
            "confianza": {"type": "number", "minimum": 0, "maximum": 1},
            "advertencias": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["cantidad", "confianza", "advertencias"],
    },
}


def contar_varillas(contenido: bytes, formato: str) -> ResultadoConteo:
    if not settings.ANTHROPIC_API_KEY:
        raise IaNoConfigurada(
            "El conteo con IA no está configurado todavía: falta la clave de la API de Anthropic. "
            "Mientras tanto, ingresa las cantidades a mano."
        )

    imagen = {
        "type": "image",
        "source": {"type": "base64", "media_type": TIPOS_MEDIO[formato], "data": base64.b64encode(contenido).decode()},
    }
    cuerpo = {
        "model": settings.ANTHROPIC_MODEL,
        "max_tokens": MAX_TOKENS,
        "system": INSTRUCCIONES,
        "tools": [HERRAMIENTA],
        "tool_choice": {"type": "tool", "name": "registrar_conteo"},
        "messages": [
            {"role": "user", "content": [imagen, {"type": "text", "text": "Cuenta los extremos de varilla de esta foto."}]}
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
        raise IaError("El conteo con IA tardó demasiado. Intenta de nuevo con otra foto.") from exc
    except httpx.RequestError as exc:
        raise IaError("No se pudo conectar con el servicio de IA.") from exc

    if respuesta.status_code != 200:
        # El detalle de Anthropic puede incluir datos de la cuenta: no se reenvía
        raise IaError(f"El servicio de IA respondió con un error ({respuesta.status_code}).")

    try:
        entrada = next(
            parte["input"]
            for parte in respuesta.json().get("content", [])
            if parte.get("type") == "tool_use" and parte.get("name") == "registrar_conteo"
        )
        resultado = ResultadoConteo(
            cantidad=entrada["cantidad"],
            confianza=entrada["confianza"],
            advertencias=[str(a) for a in entrada.get("advertencias", [])],
        )
    except (StopIteration, KeyError, ValueError, TypeError, AttributeError, ValidationError) as exc:
        raise IaError("La IA devolvió un conteo que no se pudo interpretar. Intenta de nuevo.") from exc

    if resultado.cantidad == 0 and not resultado.advertencias:
        resultado.advertencias.append("La IA no encontró extremos de varilla en la foto.")
    return resultado
