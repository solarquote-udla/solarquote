"""
Endpoints del boceto del cliente — RF-04 y RF-05.

  GET  /api/proyectos/{id}/boceto             → boceto cargado y sus bloques
  POST /api/proyectos/{id}/boceto             → cargar e interpretar (reemplaza el anterior)
  GET  /api/proyectos/{id}/boceto/archivo     → descargar el archivo original
  PUT  /api/proyectos/{id}/boceto/bloques     → corregir los bloques en la confirmación
  POST /api/proyectos/{id}/boceto/cotizacion  → confirmar y emitir la cotización

Opción de menú "Cargar boceto" (permiso cargar_boceto).
"""

from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import requiere_permiso
from app.core.permisos import Permiso
from app.models.boceto import Boceto
from app.models.usuario import Usuario
from app.schemas.boceto import BocetoBloquesEditar, BocetoLeer
from app.schemas.layout import ConfirmarLayout, CotizacionEmitidaLeer
from app.services import boceto as servicio
from app.services.calc_service import CalcServiceError
from app.services.confirmacion import NoSePuedeCotizar, cotizar_boceto
from app.services.ia_service import IaServiceError
from app.services.material import PrecioVigenteFaltante
from app.services.proyecto import ClienteNoDisponible, obtener_proyecto

puede_cargar = requiere_permiso(Permiso.CARGAR_BOCETO)

router = APIRouter(
    prefix="/api/proyectos/{proyecto_id}/boceto",
    tags=["Módulo 2 — Bocetos"],
    dependencies=[Depends(puede_cargar)],
)

TIPOS_MEDIO = {"pdf": "application/pdf", "png": "image/png", "jpg": "image/jpeg", "dxf": "application/dxf"}


def _proyecto_o_404(db: Session, proyecto_id: int):
    proyecto = obtener_proyecto(db, proyecto_id)
    if proyecto is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No existe el proyecto {proyecto_id}")
    return proyecto


def _boceto_o_404(db: Session, proyecto_id: int) -> Boceto:
    boceto = servicio.obtener_boceto(db, proyecto_id)
    if boceto is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"El proyecto {proyecto_id} todavía no tiene un boceto cargado",
        )
    return boceto


@router.get("", response_model=BocetoLeer)
def consultar(proyecto_id: int, db: Session = Depends(get_db)) -> BocetoLeer:
    _proyecto_o_404(db, proyecto_id)
    return servicio.a_respuesta(db, _boceto_o_404(db, proyecto_id))


@router.post("", response_model=BocetoLeer, status_code=status.HTTP_201_CREATED)
def cargar(
    proyecto_id: int,
    archivo: UploadFile = File(..., description="PDF, JPG, PNG o DXF de hasta 10 MB"),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(puede_cargar),
) -> BocetoLeer:
    """
    Interpreta el boceto y lo guarda. Puede tardar hasta un par de minutos
    con un PDF grande.

    409 si el proyecto ya está cotizado; 413 si supera 10 MB; 415 si el
    formato no se admite (un DWG hay que exportarlo a DXF); 422 si está
    vacío o el DXF no tiene paneles; 502/504 si ia-service falla o tarda;
    503 si la lectura con IA no está configurada.
    """
    proyecto = _proyecto_o_404(db, proyecto_id)
    # Un byte de más para saber si se pasó del límite sin leer archivos enormes
    contenido = archivo.file.read(servicio.TAMANO_MAXIMO_BYTES + 1)
    if len(contenido) > servicio.TAMANO_MAXIMO_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="El archivo supera el máximo de 10 MB.")
    if not contenido:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="El archivo está vacío.")

    try:
        boceto = servicio.cargar_boceto(db, proyecto, usuario, archivo.filename or "boceto", contenido)
    except servicio.BocetoNoEditable as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except IaServiceError as error:
        raise HTTPException(status_code=error.status_code, detail=str(error)) from error
    return servicio.a_respuesta(db, boceto)


@router.get("/archivo")
def descargar(proyecto_id: int, db: Session = Depends(get_db)) -> Response:
    """El archivo tal como lo envió el cliente."""
    _proyecto_o_404(db, proyecto_id)
    boceto = _boceto_o_404(db, proyecto_id)
    # filename* (RFC 5987) para nombres con tildes o espacios
    return Response(
        content=boceto.contenido,
        media_type=TIPOS_MEDIO.get(boceto.formato, "application/octet-stream"),
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(boceto.nombre_archivo)}"},
    )


@router.put("/bloques", response_model=BocetoLeer)
def editar_bloques(proyecto_id: int, datos: BocetoBloquesEditar, db: Session = Depends(get_db)) -> BocetoLeer:
    """
    Guarda los tipos de bloque corregidos. Se envían todos: los que no
    vienen se eliminan. 409 si el proyecto ya está cotizado o no tiene boceto.
    """
    proyecto = _proyecto_o_404(db, proyecto_id)
    try:
        boceto = servicio.editar_bloques(db, proyecto, datos)
    except servicio.BocetoNoEditable as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    return servicio.a_respuesta(db, boceto)


@router.post("/cotizacion", response_model=CotizacionEmitidaLeer, status_code=status.HTTP_201_CREATED)
def confirmar_y_cotizar(
    proyecto_id: int,
    datos: ConfirmarLayout,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(puede_cargar),
) -> CotizacionEmitidaLeer:
    """
    Confirma los bloques del boceto y emite la cotización (RF-05 → RF-06).

    409 si ya se cotizó, si no hay boceto o bloques, si hay L impar o
    bloques fuera de proporción sin aceptar; 422 si falta un precio o el
    cliente está dado de baja; 502 si calc-service no responde.
    """
    _proyecto_o_404(db, proyecto_id)
    try:
        cotizacion = cotizar_boceto(
            db,
            proyecto_id,
            usuario,
            acepta_fuera_de_proporcion=datos.acepta_fuera_de_proporcion,
            addendum_porcentaje=datos.addendum_porcentaje,
        )
    except NoSePuedeCotizar as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except (ClienteNoDisponible, PrecioVigenteFaltante) as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error
    except CalcServiceError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    return CotizacionEmitidaLeer(id=cotizacion.id, numero_proforma=cotizacion.numero_proforma, total=cotizacion.total)
