"""
Endpoint del tablero de indicadores — RF-13.

  GET /api/tablero   → los cuatro indicadores del backlog, en una sola
                        respuesta (ver `services/tablero.py`)

Exige el mismo permiso que el historial (HISTORIAL o GENERAR_LAYOUT):
son reportes derivados de las mismas cotizaciones, no un módulo nuevo.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import requiere_permiso
from app.core.permisos import Permiso
from app.schemas.tablero import TableroLeer
from app.services.tablero import MESES_POR_DEFECTO, TOP_POR_DEFECTO, obtener_tablero

puede_ver_tablero = requiere_permiso(Permiso.HISTORIAL, Permiso.GENERAR_LAYOUT)

router = APIRouter(prefix="/api/tablero", tags=["Tablero"])


@router.get("", response_model=TableroLeer, dependencies=[Depends(puede_ver_tablero)])
def leer_tablero(
    meses: int = Query(default=MESES_POR_DEFECTO, ge=1, le=24, description="Meses hacia atrás, hasta el actual"),
    top: int = Query(default=TOP_POR_DEFECTO, ge=1, le=20, description="Cuántos clientes/materiales mostrar"),
    db: Session = Depends(get_db),
) -> TableroLeer:
    return obtener_tablero(db, meses=meses, top=top)
