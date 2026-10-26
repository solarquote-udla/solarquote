"""
Endpoint de conteo de varillas — RF-14.

  POST /api/varillas/contar   (multipart, campo "archivo")

Solo lo llama la API principal, con el secreto compartido.

Errores:
  401  falta el secreto compartido
  413  la foto supera 10 MB
  415  no es una imagen JPG o PNG
  422  foto vacía
  502  la IA respondió con error o con un resultado inválido
  503  la IA no está configurada (falta la clave de Anthropic)
"""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.config import settings
from app.core.dependencies import requiere_secreto_compartido
from app.schemas.conteo import ResultadoConteo
from app.services.conteo import contar_varillas
from app.services.formato import FormatoNoAdmitido, detectar_formato
from app.services.ia import IaError, IaNoConfigurada

router = APIRouter(
    prefix="/api/varillas",
    tags=["Varillas"],
    dependencies=[Depends(requiere_secreto_compartido)],
)


@router.post("/contar", response_model=ResultadoConteo)
def contar(archivo: UploadFile = File(...)) -> ResultadoConteo:
    contenido = archivo.file.read(settings.TAMANO_MAXIMO_BYTES + 1)
    if len(contenido) > settings.TAMANO_MAXIMO_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "La foto supera el máximo de 10 MB.")
    if not contenido:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "La foto está vacía.")

    try:
        formato = detectar_formato(contenido)
    except FormatoNoAdmitido:
        formato = None
    if formato not in ("png", "jpg"):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "La foto debe ser una imagen JPG o PNG.")

    try:
        return contar_varillas(contenido, formato)
    except IaNoConfigurada as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except IaError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
