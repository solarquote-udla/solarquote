"""
Modelos de Cotización (Módulo 3 — RF-06/RF-07).

Una Cotización agrupa uno o más ítems; cada ítem representa un bloque
de estructura con su propia configuración L (paneles en el largo),
A (paneles en el ancho) y B (número de bloques iguales). El cálculo
de materiales a partir de esos valores se resuelve en otro paso —
aquí solo se modela el dato.
"""

import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class EstadoCotizacion(str, enum.Enum):
    """Ciclo de vida de la propuesta (RF-16)."""

    COTIZADA = "cotizada"
    DESPACHADA = "despachada"
    RECIBIDA = "recibida"
    INSTALADA = "instalada"


class Cotizacion(Base):
    __tablename__ = "cotizaciones"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Código de proforma (SQ-XXXX). Se asigna al emitir la cotización,
    # por eso es nullable mientras el registro está en borrador.
    numero_proforma: Mapped[str | None] = mapped_column(
        String(20),
        unique=True,
        index=True,
        nullable=True,
    )

    usuario_id: Mapped[int] = mapped_column(
        ForeignKey("usuarios.id"),
        nullable=False,
    )

    # ─── Relación con los modelos compartidos ───────────────────────────
    # Nullable a propósito: permite cotizar a un cliente que todavía no
    # está en el catálogo (caso real: llamada rápida, se cotiza al vuelo).
    # Los campos snapshot de abajo se llenan igual, y la FK se asocia después.
    cliente_id: Mapped[int | None] = mapped_column(
        ForeignKey("clientes.id"),
        nullable=True,
        index=True,
    )

    proyecto_id: Mapped[int | None] = mapped_column(
        ForeignKey("proyectos.id"),
        nullable=True,
        index=True,
    )

    # ─── Snapshot de los datos del cliente ──────────────────────────────
    # Se conservan aunque exista `cliente_id`. Una proforma es un documento
    # comercial: si el cliente cambia de teléfono en marzo, la proforma
    # emitida en enero debe seguir mostrando el teléfono de enero.
    cliente_nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    cliente_empresa: Mapped[str | None] = mapped_column(String(150), nullable=True)
    cliente_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cliente_telefono: Mapped[str | None] = mapped_column(String(30), nullable=True)

    proyecto_nombre: Mapped[str | None] = mapped_column(String(150), nullable=True)

    # Mermas de instalación: porcentaje configurable por cotización, no fijo.
    addendum_porcentaje: Mapped[Decimal] = mapped_column(
        Numeric(5, 2),
        default=Decimal("0"),
        nullable=False,
    )

    estado: Mapped[EstadoCotizacion] = mapped_column(
        SAEnum(EstadoCotizacion, name="estado_cotizacion", values_callable=lambda e: [i.value for i in e]),
        default=EstadoCotizacion.COTIZADA,
        nullable=False,
    )

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

    items: Mapped[list["ItemCotizacion"]] = relationship(
        back_populates="cotizacion",
        cascade="all, delete-orphan",
        order_by="ItemCotizacion.id",
    )

    cliente: Mapped["Cliente | None"] = relationship()  # noqa: F821
    proyecto: Mapped["Proyecto | None"] = relationship()  # noqa: F821

    def __repr__(self) -> str:
        return f"<Cotizacion {self.id} {self.numero_proforma} ({self.estado.value})>"


class ItemCotizacion(Base):
    __tablename__ = "items_cotizacion"

    id: Mapped[int] = mapped_column(primary_key=True)

    cotizacion_id: Mapped[int] = mapped_column(
        ForeignKey("cotizaciones.id"),
        nullable=False,
    )

    descripcion: Mapped[str | None] = mapped_column(String(150), nullable=True)

    # L: paneles en el largo (número par), A: paneles en el ancho,
    # B: número de bloques iguales. Usados por el cálculo f(L,A,B).
    paneles_largo: Mapped[int] = mapped_column(Integer, nullable=False)
    paneles_ancho: Mapped[int] = mapped_column(Integer, nullable=False)
    bloques: Mapped[int] = mapped_column(Integer, nullable=False)

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

    cotizacion: Mapped["Cotizacion"] = relationship(back_populates="items")

    def __repr__(self) -> str:
        return f"<ItemCotizacion {self.id} L={self.paneles_largo} A={self.paneles_ancho} B={self.bloques}>"
