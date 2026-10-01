"""
Lógica de negocio del terreno — RF-01.

El router se limita a traducir HTTP; las reglas viven aquí.
"""

from sqlalchemy.orm import Session

from app.models.proyecto import Proyecto
from app.models.terreno import Camino, Terreno
from app.schemas.terreno import CaminoCrear, TerrenoActualizar, TerrenoCrear
from app.services.geometria import calcular_areas
from app.services.proyecto import avanzar_a_en_diseno
from app.services.proyecto import obtener_proyecto  # noqa: F401 — lo usa el router


def obtener_terreno(db: Session, proyecto_id: int) -> Terreno | None:
    return (
        db.query(Terreno)
        .filter(Terreno.proyecto_id == proyecto_id)
        .one_or_none()
    )


def obtener_camino(db: Session, terreno_id: int, camino_id: int) -> Camino | None:
    return (
        db.query(Camino)
        .filter(Camino.id == camino_id, Camino.terreno_id == terreno_id)
        .one_or_none()
    )


def areas_de(terreno: Terreno) -> dict[str, float]:
    """Superficies derivadas de la geometría actual del terreno."""
    return calcular_areas(
        terreno.vertices,
        [camino.vertices for camino in terreno.caminos],
    )


def crear_terreno(db: Session, proyecto: Proyecto, datos: TerrenoCrear) -> Terreno:
    """Crea el terreno de un proyecto junto con sus caminos iniciales."""
    terreno = Terreno(
        proyecto_id=proyecto.id,
        vertices=datos.vertices,
        orientacion_norte=datos.orientacion_norte,
        notas=datos.notas,
    )

    for camino in datos.caminos:
        terreno.caminos.append(
            Camino(
                nombre=camino.nombre,
                tipo=camino.tipo,
                vertices=camino.vertices,
            )
        )

    db.add(terreno)
    avanzar_a_en_diseno(proyecto)
    db.commit()
    db.refresh(terreno)
    return terreno


def actualizar_terreno(
    db: Session,
    terreno: Terreno,
    datos: TerrenoActualizar,
) -> Terreno:
    """
    Aplica una modificación parcial.

    `exclude_unset` distingue "no me mandaron el campo" de "me mandaron
    null". Sin eso, actualizar solo las notas borraría la orientación.
    """
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(terreno, campo, valor)

    db.commit()
    db.refresh(terreno)
    return terreno


def eliminar_terreno(db: Session, terreno: Terreno) -> None:
    """Borra el terreno y, en cascada, sus caminos."""
    db.delete(terreno)
    db.commit()


def agregar_camino(db: Session, terreno: Terreno, datos: CaminoCrear) -> Camino:
    camino = Camino(
        terreno_id=terreno.id,
        nombre=datos.nombre,
        tipo=datos.tipo,
        vertices=datos.vertices,
    )
    db.add(camino)
    db.commit()
    db.refresh(camino)
    return camino


def eliminar_camino(db: Session, camino: Camino) -> None:
    db.delete(camino)
    db.commit()
