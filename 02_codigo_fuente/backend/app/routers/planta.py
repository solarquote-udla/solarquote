"""
GET /api/cotizaciones/{id}/planta: terreno y layout del proyecto de una
cotización, para verlos desde el historial (pedido de Santi, 17 de
noviembre). Mismo permiso que el detalle de la cotización.

Va en un router aparte del de cotizaciones para no mezclar la lectura del
plano con la emisión de la proforma.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import requiere_permiso
from app.core.permisos import Permiso
from app.models.cotizacion import Cotizacion
from app.schemas.planta import PlantaLeer
from app.services.planta import obtener_planta

router = APIRouter(
    prefix="/api/cotizaciones/{cotizacion_id}/planta",
    tags=["Cotización"],
    dependencies=[Depends(requiere_permiso(Permiso.HISTORIAL, Permiso.GENERAR_LAYOUT))],
)


@router.get("", response_model=PlantaLeer)
def consultar_planta(cotizacion_id: int, db: Session = Depends(get_db)) -> PlantaLeer:
    cotizacion = db.get(Cotizacion, cotizacion_id)
    if cotizacion is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No existe la cotización {cotizacion_id}")
    return obtener_planta(db, cotizacion)
