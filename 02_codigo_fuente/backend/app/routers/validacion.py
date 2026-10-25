"""
Endpoints de la validación de materiales — RF-14, RF-15 y RF-16.

  GET  /api/validacion/despachos/pendientes          → por despachar (y despachadas recientes)
  GET  /api/validacion/recepciones/pendientes        → por recibir (y recibidas recientes)
  GET  /api/validacion/cotizaciones/{id}             → materiales, despacho, recepción y línea de tiempo
  POST /api/validacion/cotizaciones/{id}/conteo      → la IA cuenta las varillas de una foto
  POST /api/validacion/cotizaciones/{id}/despacho    → confirmar el despacho (multipart)
  POST /api/validacion/cotizaciones/{id}/recepcion   → confirmar la recepción (multipart)
  POST /api/validacion/cotizaciones/{id}/instalacion → marcar la propuesta como instalada
  GET  /api/validacion/cotizaciones/{id}/fotos/{foto_id} → la foto original

Opciones de menú "Despacho en planta" (permiso despacho) y "Recepción en
terreno" (permiso recepcion). El seguimiento también lo consulta quien
tiene el historial (RF-10 y RF-16).

El despacho y la recepción llegan como multipart: el campo `datos` lleva
el JSON y `fotos` los archivos, en el mismo orden que `datos.fotos`.
"""

from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import requiere_permiso
from app.core.permisos import Permiso
from app.models.cotizacion import EstadoCotizacion
from app.models.usuario import Usuario
from app.schemas.validacion import (
    ConteoVarillasLeer,
    CotizacionAValidarLeer,
    DespachoCrear,
    RecepcionCrear,
    ValidacionLeer,
)
from app.services import validacion as servicio
from app.services.ia_service import IaServiceError

puede_despachar = requiere_permiso(Permiso.DESPACHO)
puede_recibir = requiere_permiso(Permiso.RECEPCION)
# El seguimiento lo ve quien valida y quien consulta el historial
puede_consultar = requiere_permiso(Permiso.DESPACHO, Permiso.RECEPCION, Permiso.HISTORIAL, Permiso.GENERAR_LAYOUT)
puede_instalar = requiere_permiso(Permiso.RECEPCION, Permiso.HISTORIAL)

router = APIRouter(prefix="/api/validacion", tags=["Validación de materiales"])

TIPOS_MEDIO = {"png": "image/png", "jpg": "image/jpeg"}


def _errores(error: Exception) -> HTTPException:
    if isinstance(error, servicio.CotizacionNoEncontrada):
        return HTTPException(status.HTTP_404_NOT_FOUND, str(error))
    if isinstance(error, servicio.EstadoNoPermitido):
        return HTTPException(status.HTTP_409_CONFLICT, str(error))
    if isinstance(error, servicio.DatosNoValidos):
        return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(error))
    if isinstance(error, servicio.FotoNoValida):
        return HTTPException(error.status_code, str(error))
    if isinstance(error, IaServiceError):
        return HTTPException(error.status_code, str(error))
    raise error


def _leer_datos(modelo: type[BaseModel], datos: str):
    """El JSON del campo `datos`, validado como si viniera en el cuerpo."""
    try:
        return modelo.model_validate_json(datos)
    except ValidationError as error:
        raise RequestValidationError(error.errors(include_url=False)) from error


def _leer_fotos(fotos: list[UploadFile]) -> list[servicio.Foto]:
    leidas = []
    for foto in fotos:
        # Un byte de más para saber si se pasó del límite sin leer archivos enormes
        contenido = foto.file.read(servicio.TAMANO_MAXIMO_FOTO + 1)
        leidas.append(servicio.Foto(nombre_archivo=foto.filename or "foto", contenido=contenido))
    return leidas


@router.get("/despachos/pendientes", response_model=list[CotizacionAValidarLeer], dependencies=[Depends(puede_despachar)])
def por_despachar(buscar: str | None = Query(default=None, max_length=100), db: Session = Depends(get_db)):
    """Cotizadas (por despachar) y despachadas (para consultar su reporte)."""
    return servicio.listar(db, [EstadoCotizacion.COTIZADA, EstadoCotizacion.DESPACHADA], buscar)


@router.get("/recepciones/pendientes", response_model=list[CotizacionAValidarLeer], dependencies=[Depends(puede_recibir)])
def por_recibir(buscar: str | None = Query(default=None, max_length=100), db: Session = Depends(get_db)):
    """Despachadas (por recibir) y recibidas (para consultar su reporte o marcarlas instaladas)."""
    return servicio.listar(db, [EstadoCotizacion.DESPACHADA, EstadoCotizacion.RECIBIDA], buscar)


@router.get("/cotizaciones/{cotizacion_id}", response_model=ValidacionLeer, dependencies=[Depends(puede_consultar)])
def consultar(cotizacion_id: int, db: Session = Depends(get_db)) -> ValidacionLeer:
    try:
        return servicio.a_respuesta(servicio.obtener(db, cotizacion_id))
    except Exception as error:  # noqa: BLE001 — _errores relanza lo que no reconoce
        raise _errores(error) from error


@router.post("/cotizaciones/{cotizacion_id}/conteo", response_model=ConteoVarillasLeer, dependencies=[Depends(puede_despachar)])
def contar(cotizacion_id: int, foto: UploadFile = File(..., description="JPG o PNG de hasta 10 MB"), db: Session = Depends(get_db)):
    """
    La IA cuenta los extremos de varilla de la foto. Es una estimación que
    el operario revisa; no se guarda nada hasta confirmar el despacho.
    409 si la propuesta ya se despachó; 413/415/422 si la foto no sirve;
    502/504 si ia-service falla o tarda; 503 si el conteo no está configurado.
    """
    try:
        return servicio.contar_varillas(db, cotizacion_id, _leer_fotos([foto])[0])
    except Exception as error:  # noqa: BLE001
        raise _errores(error) from error


@router.post(
    "/cotizaciones/{cotizacion_id}/despacho",
    response_model=ValidacionLeer,
    status_code=status.HTTP_201_CREATED,
)
def despachar(
    cotizacion_id: int,
    datos: str = Form(..., description="JSON con DespachoCrear"),
    fotos: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(puede_despachar),
) -> ValidacionLeer:
    """
    Registra el despacho y pasa la propuesta a despachada (RF-14 → RF-16).
    409 si no está cotizada; 422 si faltan materiales o la justificación
    de una diferencia.
    """
    entrada = _leer_datos(DespachoCrear, datos)
    try:
        cotizacion = servicio.registrar_despacho(db, cotizacion_id, entrada, _leer_fotos(fotos), usuario)
    except Exception as error:  # noqa: BLE001
        raise _errores(error) from error
    return servicio.a_respuesta(cotizacion)


@router.post(
    "/cotizaciones/{cotizacion_id}/recepcion",
    response_model=ValidacionLeer,
    status_code=status.HTTP_201_CREATED,
)
def recibir(
    cotizacion_id: int,
    datos: str = Form(..., description="JSON con RecepcionCrear"),
    fotos: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(puede_recibir),
) -> ValidacionLeer:
    """
    Registra el checklist de recepción y pasa la propuesta a recibida
    (RF-15 → RF-16). Una vez confirmada no se modifica. 409 si no está
    despachada; 422 si faltan materiales o una diferencia sin observación.
    """
    entrada = _leer_datos(RecepcionCrear, datos)
    try:
        cotizacion = servicio.registrar_recepcion(db, cotizacion_id, entrada, _leer_fotos(fotos), usuario)
    except Exception as error:  # noqa: BLE001
        raise _errores(error) from error
    return servicio.a_respuesta(cotizacion)


@router.post("/cotizaciones/{cotizacion_id}/instalacion", response_model=ValidacionLeer)
def instalar(cotizacion_id: int, db: Session = Depends(get_db), usuario: Usuario = Depends(puede_instalar)) -> ValidacionLeer:
    """Cierra el ciclo: la propuesta recibida pasa a instalada (RF-16). 409 si no está recibida."""
    try:
        cotizacion = servicio.registrar_instalacion(db, cotizacion_id, usuario)
    except Exception as error:  # noqa: BLE001
        raise _errores(error) from error
    return servicio.a_respuesta(cotizacion)


@router.get("/cotizaciones/{cotizacion_id}/fotos/{foto_id}", dependencies=[Depends(puede_consultar)])
def ver_foto(cotizacion_id: int, foto_id: int, db: Session = Depends(get_db)) -> Response:
    try:
        foto = servicio.obtener_foto(db, cotizacion_id, foto_id)
    except Exception as error:  # noqa: BLE001
        raise _errores(error) from error
    return Response(
        content=foto.contenido,
        media_type=TIPOS_MEDIO[foto.formato],
        headers={"Content-Disposition": f"inline; filename*=UTF-8''{quote(foto.nombre_archivo)}"},
    )
