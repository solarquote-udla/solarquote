"""
Lógica de negocio del terreno — RF-01.

El router se limita a traducir HTTP; las reglas viven aquí.
"""

from sqlalchemy.orm import Session

from app.models.proyecto import EstadoProyecto, Proyecto
from app.models.terreno import Camino, Terreno
from app.schemas.terreno import CaminoCrear, TerrenoActualizar, TerrenoCrear
from app.services.geometria import calcular_areas


def obtener_proyecto(db: Session, proyecto_id: int) -> Proyecto | None:
    return db.get(Proyecto, proyecto_id)


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


def _avanzar_estado_si_corresponde(proyecto: Proyecto) -> None:
    """
    Un proyecto pasa de borrador a en_diseño cuando adquiere terreno.

    Solo avanza desde BORRADOR: si el proyecto ya estaba diseñado o
    cotizado, redefinir el terreno no debe hacerlo retroceder. Esa
    decisión —qué pasa con un layout ya generado cuando cambia el
    terreno— es de RF-03 y se resuelve allí.
    """
    if proyecto.estado == EstadoProyecto.BORRADOR:
        proyecto.estado = EstadoProyecto.EN_DISENO


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
    _avanzar_estado_si_corresponde(proyecto)
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
