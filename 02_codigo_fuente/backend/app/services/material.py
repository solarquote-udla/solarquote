"""
Resolución de precios vigentes de materiales (RF-06).

El cálculo de una cotización necesita el precio vigente de cada código
de material (VAR1650, LOG, ...). Ese precio vive en `PrecioMaterial`
(RF-09) — acá solo se resuelve, no se administra.
"""

from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.material import Material, PrecioMaterial


class PrecioVigenteFaltante(ValueError):
    """Uno o más códigos de material no tienen un precio vigente."""

    def __init__(self, codigos: list[str]) -> None:
        self.codigos = codigos
        super().__init__(f"Faltan precios vigentes para: {', '.join(codigos)}")


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
