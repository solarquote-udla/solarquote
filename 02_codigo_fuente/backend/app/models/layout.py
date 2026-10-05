"""
Layout solar generado — Módulo 1 (RF-03).

Dos tablas:

  layouts         uno por proyecto: parámetros usados y resultados
  bloques_layout  cada bloque ubicado sobre el terreno

Los bloques van en filas propias, y no dentro de un JSON del layout,
porque RF-05 y la historia de edición manual (Sprint 4) los van a mover,
redimensionar y eliminar uno por uno.

Los tipos de bloque ("Bloque A × 12") no se guardan: se recalculan al
leer agrupando los bloques. Así, cuando se edite un bloque, la agrupación
nunca queda desfasada.

Layout desactualizado
---------------------
Si después de generar el layout cambia el terreno, un camino, el equipo
o la latitud, el layout ya no corresponde a los datos. No se borra — el
Gerente puede querer compararlo — pero se marca como desactualizado.

Para detectarlo se guarda una huella (SHA-256) de todas las entradas del
algoritmo. Se prefirió sobre comparar fechas porque agregar o quitar un
camino no modifica `updated_at` del terreno: son filas de otra tabla.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Layout(Base):
    __tablename__ = "layouts"

    id: Mapped[int] = mapped_column(primary_key=True)

    proyecto_id: Mapped[int] = mapped_column(
        ForeignKey("proyectos.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # ─── Parámetros con los que se generó ───────────────────────
    paneles_largo: Mapped[int] = mapped_column(nullable=False)
    pasillo_m: Mapped[float] = mapped_column(nullable=False)
    tolerancia_proporcion: Mapped[float] = mapped_column(nullable=False)
    capacidad_deseada_kwp: Mapped[float | None] = mapped_column(nullable=True)

    # ─── Resultados ─────────────────────────────────────────────
    # Columnas propias para lo que el tablero (RF-13) va a consultar;
    # el resto del detalle va en `resumen`.
    total_paneles: Mapped[int] = mapped_column(nullable=False)
    potencia_kwp: Mapped[float] = mapped_column(nullable=False)

    # Dimensiones del bloque ideal, separaciones, áreas, capacidad,
    # configuración eléctrica y advertencias. Es una foto del momento
    # de generar: no se consulta por partes.
    resumen: Mapped[dict] = mapped_column(JSONB, nullable=False)

    huella: Mapped[str] = mapped_column(String(64), nullable=False)

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

    proyecto: Mapped["Proyecto"] = relationship()  # noqa: F821

    bloques: Mapped[list["BloqueLayout"]] = relationship(
        back_populates="layout",
        cascade="all, delete-orphan",
        order_by="BloqueLayout.orden",
    )

    def __repr__(self) -> str:
        return (
            f"<Layout proyecto={self.proyecto_id} paneles={self.total_paneles} "
            f"bloques={len(self.bloques)}>"
        )


class BloqueLayout(Base):
    __tablename__ = "bloques_layout"

    id: Mapped[int] = mapped_column(primary_key=True)

    layout_id: Mapped[int] = mapped_column(
        ForeignKey("layouts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Orden en que el algoritmo los ubicó: por franja y de abajo arriba.
    orden: Mapped[int] = mapped_column(nullable=False)

    # Cuatro esquinas [x, y] en metros, en coordenadas del terreno.
    # Polígono y no x/y/ancho/alto porque el bloque puede estar rotado
    # según la orientación del norte.
    vertices: Mapped[list[list[float]]] = mapped_column(JSONB, nullable=False)

    # Notación de HEXtructure: L paneles en el largo, A en el ancho.
    paneles_largo: Mapped[int] = mapped_column(nullable=False)
    paneles_ancho: Mapped[int] = mapped_column(nullable=False)

    proporcion: Mapped[float] = mapped_column(nullable=False)
    en_proporcion: Mapped[bool] = mapped_column(nullable=False)

    layout: Mapped[Layout] = relationship(back_populates="bloques")

    def __repr__(self) -> str:
        return f"<BloqueLayout {self.orden}: {self.paneles_largo}×{self.paneles_ancho}>"
