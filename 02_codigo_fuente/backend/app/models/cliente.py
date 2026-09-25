"""
Modelo de Cliente (Módulo 4 — RF-12).

Modelo compartido: lo consumen tanto Cotización (Esteban) como
Proyecto/Layout (Joseph). Ningún módulo lo modifica sin acordarlo.
"""

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TipoIdentificacion(str, enum.Enum):
    """Tipos de identificación válidos en Ecuador."""

    CEDULA = "cedula"
    RUC = "ruc"
    PASAPORTE = "pasaporte"


class Cliente(Base):
    __tablename__ = "clientes"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Nombre de la persona natural o razón social
    nombre: Mapped[str] = mapped_column(String(150), nullable=False, index=True)

    tipo_identificacion: Mapped[TipoIdentificacion] = mapped_column(
        SAEnum(
            TipoIdentificacion,
            name="tipo_identificacion",
            values_callable=lambda e: [i.value for i in e],
        ),
        nullable=False,
    )

    # Cédula (10 dígitos), RUC (13 dígitos) o pasaporte.
    # La validación de formato va en el schema Pydantic, no aquí.
    identificacion: Mapped[str] = mapped_column(
        String(20),
        unique=True,
        index=True,
        nullable=False,
    )

    empresa: Mapped[str | None] = mapped_column(String(150), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    telefono: Mapped[str | None] = mapped_column(String(30), nullable=True)
    direccion: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Baja lógica: los clientes no se borran porque tienen cotizaciones
    # históricas asociadas.
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

    proyectos: Mapped[list["Proyecto"]] = relationship(  # noqa: F821
        back_populates="cliente",
        order_by="Proyecto.id",
    )

    def __repr__(self) -> str:
        return f"<Cliente {self.id} {self.nombre} ({self.identificacion})>"
