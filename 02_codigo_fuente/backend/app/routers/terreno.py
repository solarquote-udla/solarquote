"""
Endpoints de terreno y caminos — RF-01.

Las rutas cuelgan del proyecto (`/api/proyectos/{id}/terreno`) porque un
terreno no existe por sí solo: siempre pertenece a un proyecto, y la
relación es uno a uno. Exponerlo como `/api/terrenos/{id}` obligaría al
cliente a conocer un identificador que no aporta nada.

Acceso restringido al Gerente General: el Personal de Producción solo
interviene en el Módulo 5 (validación de materiales).
"""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import requiere_gerente
from app.models.usuario import Usuario
from app.schemas.terreno import (
    CaminoCrear,
    CaminoLeer,
    TerrenoActualizar,
    TerrenoCrear,
    TerrenoLeer,
)
from app.services import terreno as servicio

router = APIRouter(
    prefix="/api/proyectos/{proyecto_id}/terreno",
    tags=["Módulo 1 — Terreno"],
    dependencies=[Depends(requiere_gerente)],
)


def _respuesta(terreno) -> TerrenoLeer:
    """
    Arma la respuesta agregando las áreas calculadas.

    Las áreas no son columnas: se derivan de la geometría en cada
    lectura para que nunca queden desincronizadas con los caminos.
    """
    return TerrenoLeer(
        id=terreno.id,
        proyecto_id=terreno.proyecto_id,
        vertices=terreno.vertices,
        orientacion_norte=terreno.orientacion_norte,
        notas=terreno.notas,
        caminos=[CaminoLeer.model_validate(c) for c in terreno.caminos],
        areas=servicio.areas_de(terreno),
        created_at=terreno.created_at,
        updated_at=terreno.updated_at,
    )


def _proyecto_o_404(db: Session, proyecto_id: int):
    proyecto = servicio.obtener_proyecto(db, proyecto_id)
    if proyecto is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe el proyecto {proyecto_id}",
        )
    return proyecto


def _terreno_o_404(db: Session, proyecto_id: int):
    terreno = servicio.obtener_terreno(db, proyecto_id)
    if terreno is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"El proyecto {proyecto_id} todavía no tiene terreno definido"
            ),
        )
    return terreno


# ─── Terreno ────────────────────────────────────────────────────────


@router.post("", response_model=TerrenoLeer, status_code=status.HTTP_201_CREATED)
def definir_terreno(
    proyecto_id: int,
    datos: TerrenoCrear,
    db: Session = Depends(get_db),
    _: Usuario = Depends(requiere_gerente),
) -> TerrenoLeer:
    """
    Define la geometría del terreno de un proyecto.

    Si el proyecto estaba en borrador, pasa a en_diseño.
    """
    proyecto = _proyecto_o_404(db, proyecto_id)

    if servicio.obtener_terreno(db, proyecto_id) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "El proyecto ya tiene un terreno definido. "
                "Usa PATCH para modificarlo."
            ),
        )

    return _respuesta(servicio.crear_terreno(db, proyecto, datos))


@router.get("", response_model=TerrenoLeer)
def consultar_terreno(
    proyecto_id: int,
    db: Session = Depends(get_db),
) -> TerrenoLeer:
    """Devuelve el terreno con sus caminos y las áreas calculadas."""
    _proyecto_o_404(db, proyecto_id)
    return _respuesta(_terreno_o_404(db, proyecto_id))


@router.patch("", response_model=TerrenoLeer)
def modificar_terreno(
    proyecto_id: int,
    datos: TerrenoActualizar,
    db: Session = Depends(get_db),
) -> TerrenoLeer:
    """Modifica parcialmente el terreno. Los caminos van por su propia ruta."""
    _proyecto_o_404(db, proyecto_id)
    terreno = _terreno_o_404(db, proyecto_id)
    return _respuesta(servicio.actualizar_terreno(db, terreno, datos))


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def borrar_terreno(
    proyecto_id: int,
    db: Session = Depends(get_db),
) -> Response:
    """Elimina el terreno y sus caminos."""
    _proyecto_o_404(db, proyecto_id)
    servicio.eliminar_terreno(db, _terreno_o_404(db, proyecto_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ─── Caminos ────────────────────────────────────────────────────────


@router.post(
    "/caminos",
    response_model=CaminoLeer,
    status_code=status.HTTP_201_CREATED,
)
def agregar_camino(
    proyecto_id: int,
    datos: CaminoCrear,
    db: Session = Depends(get_db),
) -> CaminoLeer:
    """Agrega un camino al terreno."""
    _proyecto_o_404(db, proyecto_id)
    terreno = _terreno_o_404(db, proyecto_id)
    return CaminoLeer.model_validate(servicio.agregar_camino(db, terreno, datos))


@router.delete(
    "/caminos/{camino_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def borrar_camino(
    proyecto_id: int,
    camino_id: int,
    db: Session = Depends(get_db),
) -> Response:
    """Elimina un camino del terreno."""
    _proyecto_o_404(db, proyecto_id)
    terreno = _terreno_o_404(db, proyecto_id)

    camino = servicio.obtener_camino(db, terreno.id, camino_id)
    if camino is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"El terreno no tiene un camino con id {camino_id}",
        )

    servicio.eliminar_camino(db, camino)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
