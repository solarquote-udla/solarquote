"""
Endpoint del tablero de indicadores — RF-13.

  GET /api/tablero   → los cuatro indicadores del backlog, en una sola
                        respuesta (ver `services/tablero.py`)

Exige el mismo permiso que el historial (HISTORIAL o GENERAR_LAYOUT):
son reportes derivados de las mismas cotizaciones, no un módulo nuevo.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import requiere_permiso
from app.core.permisos import Permiso
from app.schemas.tablero import TableroLeer
from app.services.tablero import RangoInvalido, TOP_POR_DEFECTO, obtener_tablero

puede_ver_tablero = requiere_permiso(Permiso.HISTORIAL, Permiso.GENERAR_LAYOUT)

router = APIRouter(prefix="/api/tablero", tags=["Tablero"])


@router.get("", response_model=TableroLeer, dependencies=[Depends(puede_ver_tablero)])
def leer_tablero(
    desde: date | None = Query(default=None, description="Desde esta fecha, inclusive. Por defecto, hace 6 meses"),
    hasta: date | None = Query(default=None, description="Hasta esta fecha, inclusive. Por defecto, hoy"),
    top: int = Query(default=TOP_POR_DEFECTO, ge=1, le=20, description="Cuántos clientes/materiales mostrar"),
    db: Session = Depends(get_db),
) -> TableroLeer:
    try:
        return obtener_tablero(db, desde=desde, hasta=hasta, top=top)
    except RangoInvalido as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
