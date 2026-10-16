"""
Endpoints del catálogo de inversores — RF-08.

  GET   /api/inversores          → listado (?incluir_inactivos=)
  GET   /api/inversores/{id}     → detalle
  POST  /api/inversores          → alta
  PATCH /api/inversores/{id}     → marca, modelo, datos eléctricos, activo

No hay DELETE: un inversor descontinuado se desactiva (baja lógica).
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import requiere_permiso
from app.core.permisos import Permiso
from app.models.inversor import Inversor
from app.schemas.inversor import InversorActualizar, InversorCrear, InversorLeer
from app.services import inversor as servicio
from app.services.inversor import InversorDuplicado, VoltajesInconsistentes

# Leer: también desde CÁLCULO (el asistente de layout prellena con el catálogo).
lectura = requiere_permiso(Permiso.INVERSORES, Permiso.GENERAR_LAYOUT, Permiso.CARGAR_BOCETO)
administrar = requiere_permiso(Permiso.INVERSORES)

router = APIRouter(
    prefix="/api/inversores",
    tags=["Inversores"],
    dependencies=[Depends(lectura)],
)


@router.get("", response_model=list[InversorLeer])
def listar(
    incluir_inactivos: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> list[Inversor]:
    return servicio.listar_inversores(db, incluir_inactivos)


@router.get("/{inversor_id}", response_model=InversorLeer)
def detalle(inversor_id: int, db: Session = Depends(get_db)) -> Inversor:
    inversor = servicio.obtener_inversor(db, inversor_id)
    if inversor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No existe el inversor {inversor_id}")
    return inversor


@router.post(
    "",
    response_model=InversorLeer,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(administrar)],
)
def crear(datos: InversorCrear, db: Session = Depends(get_db)) -> Inversor:
    try:
        return servicio.crear_inversor(
            db,
            marca=datos.marca,
            modelo=datos.modelo,
            potencia_kw=datos.potencia_kw,
            vmax_v=datos.vmax_v,
            vmin_v=datos.vmin_v,
            mppts=datos.mppts,
            strings_por_mppt=datos.strings_por_mppt,
        )
    except InversorDuplicado as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.patch("/{inversor_id}", response_model=InversorLeer, dependencies=[Depends(administrar)])
def actualizar(inversor_id: int, datos: InversorActualizar, db: Session = Depends(get_db)) -> Inversor:
    try:
        resultado = servicio.actualizar_inversor(db, inversor_id, datos)
    except InversorDuplicado as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except VoltajesInconsistentes as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if resultado is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No existe el inversor {inversor_id}")
    return resultado
