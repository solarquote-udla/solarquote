"""
Cliente HTTP hacia ia-service (RF-04 y RF-14).

ia-service recibe el archivo y devuelve los tipos de bloque detectados.
No guarda nada: quien persiste el boceto es `services/boceto.py`.

Los errores de ia-service que el Gerente puede corregir (archivo muy
grande, formato no admitido, DXF sin paneles) llegan con su mensaje y se
reenvían tal cual; el resto se traduce a un mensaje general.
"""

import httpx

from app.core.config import settings

# Leer un PDF grande con la IA puede tardar cerca de un minuto
TIMEOUT_SEGUNDOS = 150.0

# Códigos de ia-service cuyo mensaje sirve al usuario
CODIGOS_REENVIADOS = {413, 415, 422, 502, 503}


class IaServiceError(Exception):
    """ia-service no respondió o rechazó el archivo. `status_code` es el que se devuelve al usuario."""

    def __init__(self, mensaje: str, status_code: int = 502):
        super().__init__(mensaje)
        self.status_code = status_code


def interpretar_boceto(nombre_archivo: str, contenido: bytes) -> dict:
    if not settings.IA_SERVICE_SECRET:
        raise IaServiceError(
            "La carga de bocetos no está configurada en el servidor (falta IA_SERVICE_SECRET).",
            status_code=503,
        )
    try:
        respuesta = httpx.post(
            f"{settings.IA_SERVICE_URL}/api/bocetos/interpretar",
            files={"archivo": (nombre_archivo, contenido, "application/octet-stream")},
            headers={"X-Internal-Secret": settings.IA_SERVICE_SECRET},
            timeout=TIMEOUT_SEGUNDOS,
        )
    except httpx.TimeoutException as exc:
        raise IaServiceError("El análisis del boceto tardó demasiado. Intenta de nuevo.", 504) from exc
    except httpx.RequestError as exc:
        raise IaServiceError("No se pudo conectar con el servicio de bocetos.") from exc

    if respuesta.status_code == 200:
        return respuesta.json()

    detalle = None
    if respuesta.status_code in CODIGOS_REENVIADOS:
        try:
            detalle = respuesta.json().get("detail")
        except ValueError:
            detalle = None
    if isinstance(detalle, str) and detalle:
        raise IaServiceError(detalle, respuesta.status_code)
    raise IaServiceError(f"El servicio de bocetos respondió con un error ({respuesta.status_code}).")


# Contar varillas en una foto tarda menos que leer un PDF
TIMEOUT_CONTEO_SEGUNDOS = 90.0


def contar_varillas(nombre_archivo: str, contenido: bytes) -> dict:
    """
    RF-14: la IA cuenta los extremos de varilla visibles en la foto de un
    lote. Devuelve {"cantidad", "confianza", "advertencias"}.
    """
    if not settings.IA_SERVICE_SECRET:
        raise IaServiceError(
            "El conteo con IA no está configurado en el servidor (falta IA_SERVICE_SECRET). "
            "Ingresa las cantidades a mano.",
            status_code=503,
        )
    try:
        respuesta = httpx.post(
            f"{settings.IA_SERVICE_URL}/api/varillas/contar",
            files={"archivo": (nombre_archivo, contenido, "application/octet-stream")},
            headers={"X-Internal-Secret": settings.IA_SERVICE_SECRET},
            timeout=TIMEOUT_CONTEO_SEGUNDOS,
        )
    except httpx.TimeoutException as exc:
        raise IaServiceError("El conteo de la foto tardó demasiado. Intenta de nuevo.", 504) from exc
    except httpx.RequestError as exc:
        raise IaServiceError("No se pudo conectar con el servicio de IA.") from exc

    if respuesta.status_code == 200:
        return respuesta.json()

    detalle = None
    if respuesta.status_code in CODIGOS_REENVIADOS:
        try:
            detalle = respuesta.json().get("detail")
        except ValueError:
            detalle = None
    if isinstance(detalle, str) and detalle:
        raise IaServiceError(detalle, respuesta.status_code)
    raise IaServiceError(f"El servicio de IA respondió con un error ({respuesta.status_code}).")
