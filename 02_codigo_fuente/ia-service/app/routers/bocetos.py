"""
Endpoint de interpretación de bocetos — RF-04.

  POST /api/bocetos/interpretar   (multipart, campo "archivo")

Solo lo llama la API principal, con el secreto compartido. Los DXF se
leen directamente con ezdxf; los PDF e imágenes, con la API de Claude.

Errores:
  401  falta el secreto compartido
  413  el archivo supera 10 MB
  415  formato no admitido (incluido DWG: hay que exportarlo a DXF)
  422  archivo vacío, o DXF sin paneles reconocibles
  502  la IA respondió con error o con un resultado inválido
  503  la IA no está configurada (falta la clave de Anthropic)
"""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.config import settings
from app.core.dependencies import requiere_secreto_compartido
from app.schemas.boceto import ResultadoInterpretacion
from app.services.dxf import DxfIlegible, interpretar_dxf
from app.services.formato import FormatoNoAdmitido, detectar_formato
from app.services.ia import IaError, IaNoConfigurada, interpretar_con_ia

router = APIRouter(
    prefix="/api/bocetos",
    tags=["Bocetos"],
    dependencies=[Depends(requiere_secreto_compartido)],
)


@router.post("/interpretar", response_model=ResultadoInterpretacion)
def interpretar(archivo: UploadFile = File(...)) -> ResultadoInterpretacion:
    # Se lee un byte de más para saber si se pasó del límite sin cargar archivos enormes
    contenido = archivo.file.read(settings.TAMANO_MAXIMO_BYTES + 1)
    if len(contenido) > settings.TAMANO_MAXIMO_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "El archivo supera el máximo de 10 MB.")
    if not contenido:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "El archivo está vacío.")

    try:
        formato = detectar_formato(contenido)
    except FormatoNoAdmitido as exc:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, str(exc)) from exc

    try:
        if formato == "dxf":
            return interpretar_dxf(contenido)
        return interpretar_con_ia(contenido, formato)
    except DxfIlegible as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except IaNoConfigurada as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except IaError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
