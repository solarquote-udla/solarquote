"""Catálogo de inversores de referencia (RF-08)."""

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.inversor import Inversor


class InversorDuplicado(ValueError):
    """Ya existe un inversor con esa marca y modelo."""

    def __init__(self, marca: str, modelo: str) -> None:
        self.marca = marca
        self.modelo = modelo
        super().__init__(f"Ya existe un inversor {marca} {modelo}")


def listar_inversores(db: Session, incluir_inactivos: bool = False) -> list[Inversor]:
    query = db.query(Inversor)
    if not incluir_inactivos:
        query = query.filter(Inversor.activo.is_(True))
    return query.order_by(Inversor.marca.asc(), Inversor.modelo.asc()).all()


def obtener_inversor(db: Session, inversor_id: int) -> Inversor | None:
    return db.get(Inversor, inversor_id)


def crear_inversor(
    db: Session,
    *,
    marca: str,
    modelo: str,
    potencia_kw: float,
    vmax_v: float | None,
    vmin_v: float | None,
    mppts: int | None,
    strings_por_mppt: int | None,
) -> Inversor:
    """Lanza `InversorDuplicado` si ya existe un inversor con esa marca y modelo."""
    inversor = Inversor(
        marca=marca,
        modelo=modelo,
        potencia_kw=potencia_kw,
        vmax_v=vmax_v,
        vmin_v=vmin_v,
        mppts=mppts,
        strings_por_mppt=strings_por_mppt,
    )
    db.add(inversor)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise InversorDuplicado(marca, modelo) from None
    db.refresh(inversor)
    return inversor


def actualizar_inversor(
    db: Session,
    inversor_id: int,
    *,
    marca: str | None = None,
    modelo: str | None = None,
    potencia_kw: float | None = None,
    vmax_v: float | None = ...,
    vmin_v: float | None = ...,
    mppts: int | None = ...,
    strings_por_mppt: int | None = ...,
    activo: bool | None = None,
) -> Inversor | None:
    """
    `None` si el inversor no existe.

    Los campos eléctricos opcionales usan `...` (Ellipsis) como "no
    enviado": a diferencia de `None`, que si se manda a propósito debe
    poder borrar un valor existente (p. ej. quitar `mppts`).
    """
    inversor = db.get(Inversor, inversor_id)
    if inversor is None:
        return None

    if marca is not None:
        inversor.marca = marca
    if modelo is not None:
        inversor.modelo = modelo
    if potencia_kw is not None:
        inversor.potencia_kw = potencia_kw
    if vmax_v is not ...:
        inversor.vmax_v = vmax_v
    if vmin_v is not ...:
        inversor.vmin_v = vmin_v
    if mppts is not ...:
        inversor.mppts = mppts
    if strings_por_mppt is not ...:
        inversor.strings_por_mppt = strings_por_mppt
    if activo is not None:
        inversor.activo = activo

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise InversorDuplicado(inversor.marca, inversor.modelo) from None
    db.refresh(inversor)
    return inversor
