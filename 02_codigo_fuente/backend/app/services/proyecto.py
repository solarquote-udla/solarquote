"""
Lógica de negocio de proyectos.

`Proyecto` es un modelo compartido (ver MODELOS-COMPARTIDOS.md). Este
servicio solo lo lee y lo crea; no altera su estructura.
"""

from sqlalchemy.orm import Session, joinedload

from app.models.cliente import Cliente
from app.models.proyecto import Proyecto
from app.models.terreno import Terreno
from app.models.usuario import Usuario
from app.schemas.proyecto import ProyectoCrear


class ClienteNoDisponible(ValueError):
    """El cliente indicado no existe o fue dado de baja."""


def obtener_proyecto(db: Session, proyecto_id: int) -> Proyecto | None:
    return (
        db.query(Proyecto)
        .options(joinedload(Proyecto.cliente))
        .filter(Proyecto.id == proyecto_id)
        .one_or_none()
    )


def listar_proyectos(db: Session) -> list[Proyecto]:
    """Todos los proyectos, los más recientes primero."""
    return (
        db.query(Proyecto)
        .options(joinedload(Proyecto.cliente))
        .order_by(Proyecto.created_at.desc())
        .all()
    )


def ids_con_terreno(db: Session, proyecto_ids: list[int]) -> set[int]:
    """
    Cuáles de estos proyectos ya tienen terreno definido.

    Una sola consulta para todo el listado. Se resuelve aquí y no con una
    relación en el modelo porque `Proyecto` es compartido: agregarle un
    atributo exige acordarlo, y esto no lo justifica.
    """
    if not proyecto_ids:
        return set()

    filas = (
        db.query(Terreno.proyecto_id)
        .filter(Terreno.proyecto_id.in_(proyecto_ids))
        .all()
    )
    return {fila.proyecto_id for fila in filas}


def crear_proyecto(db: Session, datos: ProyectoCrear, usuario: Usuario) -> Proyecto:
    """
    Registra un proyecto nuevo en estado borrador.

    Se exige un cliente activo: un cliente dado de baja conserva sus
    proyectos históricos, pero no recibe proyectos nuevos.
    """
    cliente = db.get(Cliente, datos.cliente_id)
    if cliente is None:
        raise ClienteNoDisponible(f"No existe el cliente {datos.cliente_id}")
    if not cliente.activo:
        raise ClienteNoDisponible(
            f"El cliente {cliente.nombre} está dado de baja y no admite proyectos nuevos"
        )

    proyecto = Proyecto(
        nombre=datos.nombre.strip(),
        cliente_id=cliente.id,
        usuario_id=usuario.id,
        ubicacion=datos.ubicacion,
        latitud=datos.latitud,
        longitud=datos.longitud,
        notas=datos.notas,
    )
    db.add(proyecto)
    db.commit()

    # Se vuelve a leer con el cliente cargado para armar la respuesta.
    return obtener_proyecto(db, proyecto.id)
