"""
Boceto del cliente — Módulo 2 (RF-04 y RF-05).

Dos tablas:

  bocetos          uno por proyecto: el archivo original y cómo se leyó
  bloques_boceto   cada tipo de bloque detectado, en notación L, A, B

A diferencia del layout (RF-03), un boceto no trae la ubicación de cada
bloque sobre el terreno: el cliente ya hizo el diseño y lo que se cotiza
son los tipos de bloque y cuántos hay de cada uno. Por eso aquí se guarda
un tipo por fila (con sus repeticiones) y no un bloque por fila.

El archivo se guarda en la base: los bocetos pesan hasta 10 MB, hay uno
por proyecto y así el respaldo de la base incluye todo. La columna se
carga diferida para que leer el boceto no traiga el archivo.
"""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, LargeBinary, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, deferred, mapped_column, relationship

from app.core.database import Base


class Boceto(Base):
    __tablename__ = "bocetos"

    id: Mapped[int] = mapped_column(primary_key=True)

    proyecto_id: Mapped[int] = mapped_column(
        ForeignKey("proyectos.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # Quién lo cargó
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)

    # ─── Archivo original ───────────────────────────────────────
    nombre_archivo: Mapped[str] = mapped_column(String(255), nullable=False)
    # pdf, png, jpg o dxf: lo detecta ia-service por el contenido, no por la extensión
    formato: Mapped[str] = mapped_column(String(4), nullable=False)
    tamano_bytes: Mapped[int] = mapped_column(nullable=False)
    contenido: Mapped[bytes] = deferred(mapped_column(LargeBinary, nullable=False))

    # ─── Interpretación ─────────────────────────────────────────
    # "dxf" (lectura directa de la geometría) o "ia" (Claude)
    metodo: Mapped[str] = mapped_column(String(3), nullable=False)
    advertencias: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    # Cuántas veces el Gerente corrigió los bloques en la confirmación (RF-05)
    ediciones_manuales: Mapped[int] = mapped_column(nullable=False, server_default="0", default=0)

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

    bloques: Mapped[list["BloqueBoceto"]] = relationship(
        back_populates="boceto",
        cascade="all, delete-orphan",
        order_by="BloqueBoceto.orden",
    )

    def __repr__(self) -> str:
        return f"<Boceto proyecto={self.proyecto_id} {self.nombre_archivo} ({self.metodo})>"


class BloqueBoceto(Base):
    __tablename__ = "bloques_boceto"
    __table_args__ = (
        CheckConstraint("paneles_largo >= 1", name="ck_bloques_boceto_largo_positivo"),
        CheckConstraint("paneles_ancho >= 1", name="ck_bloques_boceto_ancho_positivo"),
        CheckConstraint("repeticiones >= 1", name="ck_bloques_boceto_repeticiones_positivas"),
        CheckConstraint("orientacion IN ('vertical', 'horizontal')", name="ck_bloques_boceto_orientacion"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    boceto_id: Mapped[int] = mapped_column(
        ForeignKey("bocetos.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    orden: Mapped[int] = mapped_column(nullable=False)

    # Nombre del tipo en el boceto ("A", "Bloque 2"), si lo tiene
    etiqueta: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Notación de HEXtructure: L paneles en el largo, A en el ancho, B bloques iguales
    paneles_largo: Mapped[int] = mapped_column(nullable=False)
    paneles_ancho: Mapped[int] = mapped_column(nullable=False)
    repeticiones: Mapped[int] = mapped_column(nullable=False)

    orientacion: Mapped[str] = mapped_column(String(10), nullable=False)

    # Confianza de la IA entre 0 y 1. Nula si vino de un DXF o si el Gerente lo corrigió.
    confianza: Mapped[float | None] = mapped_column(nullable=True)

    boceto: Mapped[Boceto] = relationship(back_populates="bloques")

    def __repr__(self) -> str:
        return f"<BloqueBoceto {self.orden}: {self.paneles_largo}×{self.paneles_ancho}×{self.repeticiones}>"
