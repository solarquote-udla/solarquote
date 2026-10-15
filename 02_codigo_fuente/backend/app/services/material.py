"""
Catálogo de materiales y administración de precios (RF-06 y RF-09).

El cálculo de una cotización necesita el precio vigente de cada código
de material (VAR1650, LOG, ...); eso lo resuelve `obtener_precios_vigentes`.
El resto del archivo administra ese precio: cambiarlo cierra la vigencia
del anterior en vez de sobrescribirlo, para que una cotización ya emitida
(que guarda su propio snapshot en `MaterialCotizado`) nunca cambie de
total porque el precio de un material cambió después.
"""

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.material import Material, PrecioMaterial


class PrecioVigenteFaltante(ValueError):
    """Uno o más códigos de material no tienen un precio vigente."""

    def __init__(self, codigos: list[str]) -> None:
        self.codigos = codigos
        super().__init__(f"Faltan precios vigentes para: {', '.join(codigos)}")


class MaterialNoDisponible(ValueError):
    """No existe el material pedido."""

    def __init__(self, material_id: int) -> None:
        super().__init__(f"No existe el material {material_id}")


class CodigoDuplicado(ValueError):
    """Ya existe un material con ese código."""

    def __init__(self, codigo: str) -> None:
        self.codigo = codigo
        super().__init__(f"Ya existe un material con el código {codigo}")


def obtener_precios_vigentes(db: Session, codigos: list[str]) -> dict[str, Decimal]:
    """
    Precio vigente (`vigente_hasta IS NULL`) de cada código pedido.

    Lanza `PrecioVigenteFaltante` si algún código no existe como material
    o no tiene un precio vigente: una cotización no se arma con precios
    a medias.
    """
    filas = (
        db.query(Material.codigo, PrecioMaterial.precio)
        .join(PrecioMaterial, PrecioMaterial.material_id == Material.id)
        .filter(Material.codigo.in_(codigos), PrecioMaterial.vigente_hasta.is_(None))
        .all()
    )
    precios = {codigo: precio for codigo, precio in filas}

    faltantes = sorted(set(codigos) - set(precios))
    if faltantes:
        raise PrecioVigenteFaltante(faltantes)

    return precios


def _precio_vigente(db: Session, material_id: int) -> PrecioMaterial | None:
    return (
        db.query(PrecioMaterial)
        .filter(PrecioMaterial.material_id == material_id, PrecioMaterial.vigente_hasta.is_(None))
        .one_or_none()
    )


def listar_materiales(db: Session, incluir_inactivos: bool = False) -> list[tuple[Material, PrecioMaterial | None]]:
    """Cada material con su precio vigente (`None` si todavía no tiene uno)."""
    query = db.query(Material)
    if not incluir_inactivos:
        query = query.filter(Material.activo.is_(True))
    materiales = query.order_by(Material.nombre.asc()).all()
    return [(material, _precio_vigente(db, material.id)) for material in materiales]


def obtener_material(db: Session, material_id: int) -> tuple[Material, PrecioMaterial | None] | None:
    material = db.get(Material, material_id)
    if material is None:
        return None
    return material, _precio_vigente(db, material_id)


def obtener_historial_precios(db: Session, material_id: int) -> list[PrecioMaterial] | None:
    """`None` si el material no existe; lista vacía si no tiene precios todavía."""
    if db.get(Material, material_id) is None:
        return None
    return (
        db.query(PrecioMaterial)
        .filter(PrecioMaterial.material_id == material_id)
        .order_by(PrecioMaterial.vigente_desde.desc())
        .all()
    )


def actualizar_precio(db: Session, material_id: int, precio: Decimal) -> tuple[Material, PrecioMaterial] | None:
    """
    Cierra la vigencia del precio actual (si hay uno) y registra el nuevo.

    `None` si el material no existe. Las cotizaciones ya emitidas no se
    tocan: guardan su propio precio en `MaterialCotizado`.
    """
    material = db.get(Material, material_id)
    if material is None:
        return None

    ahora = datetime.now(timezone.utc)

    anterior = _precio_vigente(db, material_id)
    if anterior is not None:
        anterior.vigente_hasta = ahora

    nuevo = PrecioMaterial(material_id=material_id, precio=precio, vigente_desde=ahora, vigente_hasta=None)
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return material, nuevo


def crear_material(db: Session, codigo: str, nombre: str, unidad: str) -> Material:
    """Lanza `CodigoDuplicado` si ya existe un material con ese código."""
    material = Material(codigo=codigo, nombre=nombre, unidad=unidad)
    db.add(material)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise CodigoDuplicado(codigo) from None
    db.refresh(material)
    return material


def actualizar_material(
    db: Session,
    material_id: int,
    *,
    nombre: str | None = None,
    unidad: str | None = None,
    activo: bool | None = None,
) -> tuple[Material, PrecioMaterial | None] | None:
    """`None` si el material no existe. El código es inmutable (lo usa el cálculo)."""
    material = db.get(Material, material_id)
    if material is None:
        return None

    if nombre is not None:
        material.nombre = nombre
    if unidad is not None:
        material.unidad = unidad
    if activo is not None:
        material.activo = activo

    db.commit()
    db.refresh(material)
    return material, _precio_vigente(db, material_id)
