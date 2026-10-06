"""
Endpoints del layout solar — RF-03.

  GET  /api/proyectos/{id}/layout           → último layout generado
  POST /api/proyectos/{id}/layout           → generar (reemplaza el anterior)
  PUT  /api/proyectos/{id}/layout/bloques   → guardar la edición manual (SQ-64)

POST y no PUT: el cliente no envía el layout, envía parámetros y el
servidor lo calcula. Dos POST con los mismos parámetros dan el mismo
resultado solo si terreno y equipo no cambiaron entre medio.

Solo Gerente General, igual que RF-01 y RF-02.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import requiere_gerente
from app.schemas.layout import LayoutEditar, LayoutGenerar, LayoutLeer
from app.services import layout as servicio
from app.services.calculo_layout import EdicionInvalida, LayoutImposible
from app.services.proyecto import obtener_proyecto

router = APIRouter(
    prefix="/api/proyectos/{proyecto_id}/layout",
    tags=["Módulo 1 — Layout"],
    dependencies=[Depends(requiere_gerente)],
)


def _proyecto_o_404(db: Session, proyecto_id: int):
    proyecto = obtener_proyecto(db, proyecto_id)
    if proyecto is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe el proyecto {proyecto_id}",
        )
    return proyecto


@router.get("", response_model=LayoutLeer)
def consultar_layout(proyecto_id: int, db: Session = Depends(get_db)) -> LayoutLeer:
    """Último layout generado. Indica si quedó desactualizado."""
    proyecto = _proyecto_o_404(db, proyecto_id)
    layout = servicio.obtener_layout(db, proyecto_id)
    if layout is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"El proyecto {proyecto_id} todavía no tiene layout generado",
        )
    return servicio.a_respuesta(layout, servicio.huella_actual(db, proyecto))


@router.post("", response_model=LayoutLeer)
def generar_layout(
    proyecto_id: int,
    datos: LayoutGenerar,
    db: Session = Depends(get_db),
) -> LayoutLeer:
    """
    Distribuye los bloques sobre el terreno y guarda el resultado.

    409 si faltan terreno o equipo; 422 si no entra ningún bloque. En
    ambos casos el mensaje dice qué corregir.
    """
    proyecto = _proyecto_o_404(db, proyecto_id)
    try:
        layout = servicio.generar(db, proyecto, datos)
    except servicio.FaltanDatos as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except LayoutImposible as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
        ) from error
    return servicio.a_respuesta(layout, layout.huella)


@router.put("/bloques", response_model=LayoutLeer)
def editar_bloques(
    proyecto_id: int,
    datos: LayoutEditar,
    db: Session = Depends(get_db),
) -> LayoutLeer:
    """
    Guarda los bloques editados a mano. Se envían todos los que quedan:
    los que no vienen se eliminan.

    409 si no hay layout o está desactualizado; 422 si un bloque se sale
    del terreno, pisa un camino o se superpone con otro.
    """
    proyecto = _proyecto_o_404(db, proyecto_id)
    try:
        layout = servicio.editar_bloques(db, proyecto, datos)
    except servicio.LayoutNoEditable as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except EdicionInvalida as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
        ) from error
    return servicio.a_respuesta(layout, layout.huella)
