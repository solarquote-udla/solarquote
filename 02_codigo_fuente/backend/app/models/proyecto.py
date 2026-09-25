"""
Modelo de Proyecto.

Modelo compartido. Es la raíz de todo el trabajo técnico:
  - El Módulo 1 (Layout) le cuelga el terreno, los caminos y los bloques
  - El Módulo 3 (Cotización) lo referencia para saber qué se cotizó

Ningún módulo lo modifica sin acordarlo con el otro.

NOTA: las tablas de terreno, configuración de equipo y bloques generados
NO van aquí. Las agrega el Módulo 1 en el Sprint 3, colgando de `proyecto_id`.
"""

import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Numeric,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class EstadoProyecto(str, enum.Enum):
    """Estado del trabajo técnico sobre el proyecto."""

    BORRADOR = "borrador"        # creado, sin terreno definido
    EN_DISENO = "en_diseno"      # terreno y equipo configurados
    DISENADO = "disenado"        # layout generado
    COTIZADO = "cotizado"        # tiene al menos una cotización emitida


class Proyecto(Base):
    __tablename__ = "proyectos"

    id: Mapped[int] = mapped_column(primary_key=True)

    nombre: Mapped[str] = mapped_column(String(150), nullable=False, index=True)

    cliente_id: Mapped[int] = mapped_column(
        ForeignKey("clientes.id"),
        nullable=False,
        index=True,
    )

    # Quién creó el proyecto
    usuario_id: Mapped[int] = mapped_column(
        ForeignKey("usuarios.id"),
        nullable=False,
    )

    # Ubicación textual: provincia, cantón, referencia
    ubicacion: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Coordenadas del terreno. Sirven para orientación de paneles y para
    # estimar irradiación solar más adelante.
    latitud: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    longitud: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)

    estado: Mapped[EstadoProyecto] = mapped_column(
        SAEnum(
            EstadoProyecto,
            name="estado_proyecto",
            values_callable=lambda e: [i.value for i in e],
        ),
        default=EstadoProyecto.BORRADOR,
        nullable=False,
    )

    notas: Mapped[str | None] = mapped_column(String(500), nullable=True)

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

    cliente: Mapped["Cliente"] = relationship(  # noqa: F821
        back_populates="proyectos",
    )

    def __repr__(self) -> str:
        return f"<Proyecto {self.id} {self.nombre} ({self.estado.value})>"
