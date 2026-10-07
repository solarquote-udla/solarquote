"""
Endpoints de materiales y precios — RF-09.

  GET   /api/materiales               → listado (?incluir_inactivos=)
  GET   /api/materiales/{id}          → detalle
  GET   /api/materiales/{id}/precios  → historial de precios
  PATCH /api/materiales/{id}/precio   → registrar un precio nuevo

Solo Gerente General.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import requiere_gerente
from app.models.material import Material, PrecioMaterial
from app.schemas.material import MaterialLeer, PrecioActualizar, PrecioMaterialLeer
from app.services import material as servicio

router = APIRouter(
    prefix="/api/materiales",
    tags=["Materiales"],
    dependencies=[Depends(requiere_gerente)],
)


def _respuesta(material: Material, precio: PrecioMaterial | None) -> MaterialLeer:
    return MaterialLeer(
        id=material.id,
        codigo=material.codigo,
        nombre=material.nombre,
        unidad=material.unidad,
        activo=material.activo,
        precio_vigente=precio.precio if precio else None,
        vigente_desde=precio.vigente_desde if precio else None,
    )


@router.get("", response_model=list[MaterialLeer])
def listar(
    incluir_inactivos: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> list[MaterialLeer]:
    return [_respuesta(material, precio) for material, precio in servicio.listar_materiales(db, incluir_inactivos)]


@router.get("/{material_id}", response_model=MaterialLeer)
def detalle(material_id: int, db: Session = Depends(get_db)) -> MaterialLeer:
    resultado = servicio.obtener_material(db, material_id)
    if resultado is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No existe el material {material_id}")
    return _respuesta(*resultado)


@router.get("/{material_id}/precios", response_model=list[PrecioMaterialLeer])
def historial_precios(material_id: int, db: Session = Depends(get_db)) -> list[PrecioMaterialLeer]:
    historial = servicio.obtener_historial_precios(db, material_id)
    if historial is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No existe el material {material_id}")
    return historial


@router.patch("/{material_id}/precio", response_model=MaterialLeer)
def actualizar_precio(material_id: int, datos: PrecioActualizar, db: Session = Depends(get_db)) -> MaterialLeer:
    resultado = servicio.actualizar_precio(db, material_id, datos.precio)
    if resultado is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No existe el material {material_id}")
    return _respuesta(*resultado)
