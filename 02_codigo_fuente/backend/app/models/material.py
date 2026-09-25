"""
Catálogo de materiales y su historial de precios (RF-09).

El precio de un material cambia con el tiempo, pero una cotización ya
emitida debe conservar el precio vigente al momento de su emisión.
Por eso el precio no es una columna de `Material`: cada cambio agrega
una fila nueva en `PrecioMaterial` con su propia vigencia, y la fila
"actual" es la que tiene `vigente_hasta` en null.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Numeric, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Material(Base):
    __tablename__ = "materiales"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Código usado por la lógica de cálculo f(L,A,B) (VAR1650, HEX_V18MM, ...)
    codigo: Mapped[str] = mapped_column(String(30), unique=True, index=True, nullable=False)

    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    unidad: Mapped[str] = mapped_column(String(20), default="unidad", nullable=False)

    # Baja lógica: un material descontinuado no se borra, se desactiva.
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    precios: Mapped[list["PrecioMaterial"]] = relationship(
        back_populates="material",
        cascade="all, delete-orphan",
        order_by="PrecioMaterial.vigente_desde.desc()",
    )

    def __repr__(self) -> str:
        return f"<Material {self.codigo}>"


class PrecioMaterial(Base):
    __tablename__ = "precios_material"

    # Un solo precio vigente (vigente_hasta IS NULL) por material: si un bug
    # de RF-09 llegara a insertar dos, el cálculo no sabría cuál usar.
    __table_args__ = (
        Index(
            "ux_precio_vigente_por_material",
            "material_id",
            unique=True,
            postgresql_where=text("vigente_hasta IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    material_id: Mapped[int] = mapped_column(
        ForeignKey("materiales.id"),
        index=True,
        nullable=False,
    )

    precio: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    vigente_desde: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    # null mientras el precio esté vigente; se completa al registrar el
    # siguiente cambio de precio de este material.
    vigente_hasta: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    material: Mapped["Material"] = relationship(back_populates="precios")

    def __repr__(self) -> str:
        return f"<PrecioMaterial material_id={self.material_id} precio={self.precio} desde={self.vigente_desde}>"
