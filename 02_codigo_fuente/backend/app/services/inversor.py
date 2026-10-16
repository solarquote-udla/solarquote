"""Catálogo de inversores de referencia (RF-08)."""

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.inversor import Inversor
from app.schemas.inversor import InversorActualizar


class InversorDuplicado(ValueError):
    """Ya existe un inversor con esa marca y modelo."""

    def __init__(self, marca: str, modelo: str) -> None:
        self.marca = marca
        self.modelo = modelo
        super().__init__(f"Ya existe un inversor {marca} {modelo}")


class VoltajesInconsistentes(ValueError):
    """Tras aplicar la actualización, el inversor quedaría con los voltajes mal."""

    def __init__(self, *, orden: bool = False) -> None:
        if orden:
            mensaje = "El voltaje máximo debe ser mayor que el mínimo."
        else:
            mensaje = (
                "El inversor debe tener Vmax y Vmin juntos o ninguno: la actualización "
                "dejaría solo uno de los dos."
            )
        super().__init__(mensaje)


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
    except IntegrityError as exc:
        db.rollback()
        if _es_marca_modelo_duplicado(exc):
            raise InversorDuplicado(marca, modelo) from None
        raise
    db.refresh(inversor)
    return inversor


def actualizar_inversor(db: Session, inversor_id: int, datos: InversorActualizar) -> Inversor | None:
    """
    `None` si el inversor no existe.

    `exclude_unset`: solo los campos que vinieron en el request, para
    distinguir "no lo mandaron" (queda igual) de "lo mandaron en null"
    (se borra) — necesario para poder quitar, por ejemplo, `mppts` a
    propósito sin tocar los demás campos opcionales.
    """
    inversor = db.get(Inversor, inversor_id)
    if inversor is None:
        return None

    cambios = datos.model_dump(exclude_unset=True)
    for campo, valor in cambios.items():
        setattr(inversor, campo, valor)

    # El schema solo valida los voltajes cuando el request trae los dos
    # juntos; acá, ya con el registro fusionado, se completa la regla
    # (RF-08) para el caso en que la actualización deja colgado un solo
    # lado (p. ej. borra vmax_v pero vmin_v seguía de antes) o invierte el
    # orden mandando solo uno de los dos (p. ej. sube vmin_v por encima
    # del vmax_v que ya tenía guardado).
    if (inversor.vmax_v is None) != (inversor.vmin_v is None):
        db.rollback()
        raise VoltajesInconsistentes
    if inversor.vmax_v is not None and inversor.vmin_v is not None and inversor.vmax_v <= inversor.vmin_v:
        db.rollback()
        raise VoltajesInconsistentes(orden=True)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if _es_marca_modelo_duplicado(exc):
            raise InversorDuplicado(inversor.marca, inversor.modelo) from None
        raise
    db.refresh(inversor)
    return inversor


def _es_marca_modelo_duplicado(exc: IntegrityError) -> bool:
    """Distingue la violación del unique (marca, modelo) de cualquier otra."""
    diag = getattr(exc.orig, "diag", None)
    return getattr(diag, "constraint_name", None) == "ux_inversor_marca_modelo"
