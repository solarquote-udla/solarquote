"""
CRUD de clientes — RF-12. Ver CONTRATO-CLIENTES.md.

`Cliente` es un modelo compartido (ver MODELOS-COMPARTIDOS.md): este
servicio solo lo lee y lo administra, no altera su estructura.
"""

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.cliente import Cliente
from app.models.proyecto import Proyecto
from app.schemas.cliente import ClienteActualizar, ClienteCrear
from app.services.validaciones_identificacion import validar_identificacion


class IdentificacionDuplicada(ValueError):
    """Ya existe otro cliente (activo o no) con esa identificación."""

    def __init__(self, identificacion: str, cliente_existente: Cliente) -> None:
        self.cliente_existente = cliente_existente
        super().__init__(
            f"Ya existe un cliente con la identificación {identificacion}: {cliente_existente.nombre}"
        )


def _total_proyectos(db: Session, cliente_id: int) -> int:
    return db.query(func.count(Proyecto.id)).filter(Proyecto.cliente_id == cliente_id).scalar() or 0


def _buscar_duplicado(db: Session, identificacion: str, excluir_id: int | None = None) -> Cliente | None:
    query = db.query(Cliente).filter(Cliente.identificacion == identificacion)
    if excluir_id is not None:
        query = query.filter(Cliente.id != excluir_id)
    return query.first()


def listar_clientes(
    db: Session,
    buscar: str | None,
    incluir_inactivos: bool,
) -> list[tuple[Cliente, int]]:
    query = db.query(Cliente)
    if not incluir_inactivos:
        query = query.filter(Cliente.activo.is_(True))
    if buscar:
        patron = f"%{buscar}%"
        query = query.filter(
            or_(
                Cliente.nombre.ilike(patron),
                Cliente.empresa.ilike(patron),
                Cliente.identificacion.ilike(patron),
            )
        )
    clientes = query.order_by(Cliente.nombre.asc()).all()
    return [(cliente, _total_proyectos(db, cliente.id)) for cliente in clientes]


def obtener_cliente(db: Session, cliente_id: int) -> tuple[Cliente, int] | None:
    cliente = db.get(Cliente, cliente_id)
    if cliente is None:
        return None
    return cliente, _total_proyectos(db, cliente_id)


def crear_cliente(db: Session, datos: ClienteCrear) -> tuple[Cliente, int]:
    duplicado = _buscar_duplicado(db, datos.identificacion)
    if duplicado is not None:
        raise IdentificacionDuplicada(datos.identificacion, duplicado)

    cliente = Cliente(
        nombre=datos.nombre,
        tipo_identificacion=datos.tipo_identificacion,
        identificacion=datos.identificacion,
        empresa=datos.empresa,
        email=datos.email,
        telefono=datos.telefono,
        direccion=datos.direccion,
    )
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return cliente, 0


def actualizar_cliente(
    db: Session,
    cliente_id: int,
    datos: ClienteActualizar,
) -> tuple[Cliente, int] | None:
    cliente = db.get(Cliente, cliente_id)
    if cliente is None:
        return None

    # exclude_unset: solo los campos que vinieron en el request, para
    # distinguir "no lo mandaron" (queda igual) de "lo mandaron en null"
    # (se borra) — con un dict plano de Optional[...] no se puede.
    cambios = datos.model_dump(exclude_unset=True)

    for campo in ("nombre", "tipo_identificacion"):
        if campo in cambios and cambios[campo] is None:
            raise ValueError(f"{campo} no puede quedar vacío")

    if "tipo_identificacion" in cambios and "identificacion" not in cambios:
        # Cambia el tipo pero no el número: el que ya está guardado
        # tiene que seguir siendo válido para el tipo nuevo.
        validar_identificacion(cambios["tipo_identificacion"], cliente.identificacion)

    if "identificacion" in cambios:
        if cambios["identificacion"] is None:
            raise ValueError("identificacion no puede quedar vacía")
        if "tipo_identificacion" not in cambios:
            # El schema ya la validó si vino junto con tipo_identificacion;
            # si no, se valida contra el tipo ya guardado.
            cambios["identificacion"] = validar_identificacion(cliente.tipo_identificacion, cambios["identificacion"])
        duplicado = _buscar_duplicado(db, cambios["identificacion"], excluir_id=cliente.id)
        if duplicado is not None:
            raise IdentificacionDuplicada(cambios["identificacion"], duplicado)

    for campo, valor in cambios.items():
        setattr(cliente, campo, valor)

    db.commit()
    db.refresh(cliente)
    return cliente, _total_proyectos(db, cliente.id)


def dar_de_baja(db: Session, cliente_id: int) -> Cliente | None:
    """Baja lógica. Idempotente: dar de baja a uno ya inactivo no es error."""
    cliente = db.get(Cliente, cliente_id)
    if cliente is None:
        return None
    cliente.activo = False
    db.commit()
    db.refresh(cliente)
    return cliente
