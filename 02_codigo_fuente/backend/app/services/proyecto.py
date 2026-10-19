"""
Lógica de negocio de proyectos.

`Proyecto` es un modelo compartido (ver MODELOS-COMPARTIDOS.md). Este
servicio solo lo lee y lo crea; no altera su estructura.
"""

from dataclasses import dataclass, field

from sqlalchemy import exists, select
from sqlalchemy.orm import Session, joinedload

from app.models.boceto import Boceto
from app.models.cliente import Cliente
from app.models.cotizacion import Cotizacion
from app.models.proyecto import EstadoProyecto, Proyecto
from app.models.equipo import ConfiguracionEquipo
from app.models.layout import Layout
from app.models.terreno import Terreno
from app.models.usuario import Usuario
from app.schemas.proyecto import ProyectoActualizar, ProyectoCrear


class ClienteNoDisponible(ValueError):
    """El cliente indicado no existe o fue dado de baja."""


def obtener_proyecto(db: Session, proyecto_id: int) -> Proyecto | None:
    return (
        db.query(Proyecto)
        .options(joinedload(Proyecto.cliente))
        .filter(Proyecto.id == proyecto_id)
        .one_or_none()
    )


def avanzar_a_en_diseno(proyecto: Proyecto) -> None:
    """
    Un proyecto pasa de borrador a en_diseño cuando se le define terreno
    o equipo, lo que ocurra primero.

    Solo avanza desde BORRADOR: si el proyecto ya estaba diseñado o
    cotizado, reconfigurarlo no lo hace retroceder. Qué pasa con un
    layout ya generado cuando cambian terreno o equipo es una decisión
    de RF-03 y se resuelve allí.

    No hace commit: lo hace quien llama, junto con el resto del cambio.
    """
    if proyecto.estado == EstadoProyecto.BORRADOR:
        proyecto.estado = EstadoProyecto.EN_DISENO


def avanzar_a_cotizado(proyecto: Proyecto) -> None:
    """
    Un proyecto pasa a cotizado en cuanto tiene su primera cotización,
    venga de borrador, en_diseño o diseñado — a diferencia del layout,
    cotizar no exige un estado previo puntual.

    Es el último estado: esto solo evita un UPDATE de más si ya estaba
    cotizado, no hay a dónde "retroceder".

    No hace commit: lo hace quien llama, junto con el resto del cambio.
    """
    if proyecto.estado != EstadoProyecto.COTIZADO:
        proyecto.estado = EstadoProyecto.COTIZADO


def listar_proyectos(db: Session) -> list[Proyecto]:
    """Todos los proyectos, los más recientes primero."""
    return (
        db.query(Proyecto)
        .options(joinedload(Proyecto.cliente))
        .order_by(Proyecto.created_at.desc())
        .all()
    )


@dataclass(frozen=True)
class Avance:
    """Qué pasos del asistente ya tienen datos guardados."""

    terreno: set[int]
    equipo: set[int]
    layout: set[int]
    # Cotización emitida de cada proyecto: (id, número de proforma)
    cotizacion: dict[int, tuple[int, str | None]] = field(default_factory=dict)
    # Proyectos con boceto del cliente (RF-04): se retoman en su confirmación
    boceto: set[int] = field(default_factory=set)


def avance_de(db: Session, proyecto_ids: list[int]) -> Avance:
    """
    Cuáles de estos proyectos ya tienen terreno, equipo, layout o boceto.

    El estado del proyecto no alcanza para esto: pasa a "en diseño" en
    cuanto se guarda el terreno o el equipo, sin distinguir cuál. El
    Historial lo usa para retomar cada proyecto en el paso que le falta.

    Una sola consulta para todo el listado (y para un solo proyecto). Se resuelve
    aquí y no con relaciones en el modelo porque `Proyecto` es compartido:
    agregarle atributos exige acordarlo, y esto no lo justifica.
    """
    if not proyecto_ids:
        return Avance(set(), set(), set())

    def existe(modelo):
        return exists().where(modelo.proyecto_id == Proyecto.id)

    def ultima_cotizacion(columna):
        # La más reciente del proyecto (hoy se emite una sola por proyecto)
        return (
            select(columna)
            .where(Cotizacion.proyecto_id == Proyecto.id)
            .order_by(Cotizacion.created_at.desc(), Cotizacion.id.desc())
            .limit(1)
            .scalar_subquery()
        )

    # Una sola consulta: un EXISTS por paso y la última cotización, por cada proyecto pedido
    filas = db.execute(
        select(
            Proyecto.id,
            existe(Terreno),
            existe(ConfiguracionEquipo),
            existe(Layout),
            ultima_cotizacion(Cotizacion.id),
            ultima_cotizacion(Cotizacion.numero_proforma),
            existe(Boceto),
        ).where(Proyecto.id.in_(proyecto_ids))
    ).all()
    return Avance(
        terreno={pid for pid, t, _, _, _, _, _ in filas if t},
        equipo={pid for pid, _, e, _, _, _, _ in filas if e},
        layout={pid for pid, _, _, l, _, _, _ in filas if l},
        cotizacion={pid: (cid, numero) for pid, _, _, _, cid, numero, _ in filas if cid is not None},
        boceto={pid for pid, *_, b in filas if b},
    )


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


def actualizar_proyecto(db: Session, proyecto: Proyecto, datos: ProyectoActualizar) -> Proyecto:
    """
    Aplica solo los campos enviados.

    Si cambia la latitud, el layout generado queda marcado como
    desactualizado por su huella (ver services/layout.py): no hay que
    avisarle desde aquí.
    """
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        if isinstance(valor, str):
            valor = valor.strip() or None
        setattr(proyecto, campo, valor)

    db.commit()
    return obtener_proyecto(db, proyecto.id)
