"""
Modelos de Terreno y Camino — Módulo 1 (RF-01).

Geometría
---------
Tanto el terreno como sus caminos se guardan como polígonos: una lista
ordenada de vértices en metros, relativa a un origen local (0,0) que es
la esquina de referencia del terreno.

Se eligió el polígono sobre el par largo/ancho porque el criterio de
aceptación de RF-01 pide dibujar el terreno indicando sus vértices, y
porque HEXtructure trabaja sobre terrenos que no siempre son regulares.
Un rectángulo es simplemente un polígono de cuatro vértices, así que el
algoritmo de layout rectangular del Sprint 3 (RF-03) opera sin cambios.

Se descartó PostGIS: para tres o cuatro polígonos por proyecto no
compensa la extensión, y complica Alembic y las pruebas. El cálculo de
áreas se hace en Python con la fórmula del área de Gauss.

Unidades
--------
Metros en todos los casos. Las coordenadas son planas: a la escala de un
proyecto fotovoltaico (decenas o pocos cientos de metros) la curvatura
terrestre es despreciable.
"""

import enum
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# Un vértice es [x, y] en metros. Un polígono es la lista de sus vértices
# en orden, sin repetir el primero al final: el cierre es implícito.
Vertices = list[list[float]]


class TipoCamino(str, enum.Enum):
    """
    Clasificación del camino según su función en la instalación.

    No afecta el cálculo de área — todo camino resta igual — pero
    HEXtructure necesita distinguirlos al revisar el diseño, y el
    Módulo 2 los usará para decidir por dónde puede circular el
    equipo de montaje.
    """

    ACCESO = "acceso"              # entrada al predio desde la vía pública
    INTERNO = "interno"            # circulación entre bloques de paneles
    MANTENIMIENTO = "mantenimiento"  # paso peatonal para limpieza y revisión


class Terreno(Base):
    """
    Geometría del predio donde se instalarán las estructuras.

    Relación uno a uno con Proyecto: un proyecto describe una
    instalación en un solo predio. Si HEXtructure llegara a cotizar
    predios separados bajo un mismo cliente, son proyectos distintos.
    """

    __tablename__ = "terrenos"

    id: Mapped[int] = mapped_column(primary_key=True)

    proyecto_id: Mapped[int] = mapped_column(
        ForeignKey("proyectos.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,  # uno a uno
        index=True,
    )

    # Polígono del predio. Mínimo 3 vértices; la validación vive en el
    # schema de Pydantic, no aquí, para que el error llegue al cliente
    # como 422 y no como excepción de base de datos.
    vertices: Mapped[Vertices] = mapped_column(JSONB, nullable=False)

    # Orientación del norte respecto al eje Y positivo, en grados.
    # Necesaria en RF-03 para inclinar los paneles hacia el ecuador.
    # Nula mientras no se haya levantado en sitio.
    orientacion_norte: Mapped[float | None] = mapped_column(nullable=True)

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

    proyecto: Mapped["Proyecto"] = relationship()  # noqa: F821

    caminos: Mapped[list["Camino"]] = relationship(
        back_populates="terreno",
        cascade="all, delete-orphan",
        # Los caminos no tienen sentido fuera de su terreno: si se borra
        # el terreno, se van con él.
    )

    def __repr__(self) -> str:
        return (
            f"<Terreno {self.id} proyecto={self.proyecto_id} "
            f"vertices={len(self.vertices)} caminos={len(self.caminos)}>"
        )


class Camino(Base):
    """
    Franja del terreno que no puede ocuparse con estructuras.

    Se modela como polígono, igual que el terreno, para poder
    representar caminos en diagonal o con quiebres sin casos especiales
    en el cálculo de área.
    """

    __tablename__ = "caminos"

    id: Mapped[int] = mapped_column(primary_key=True)

    terreno_id: Mapped[int] = mapped_column(
        ForeignKey("terrenos.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    nombre: Mapped[str | None] = mapped_column(String(100), nullable=True)

    tipo: Mapped[TipoCamino] = mapped_column(
        SAEnum(
            TipoCamino,
            name="tipo_camino",
            values_callable=lambda e: [i.value for i in e],
        ),
        default=TipoCamino.INTERNO,
        nullable=False,
    )

    vertices: Mapped[Vertices] = mapped_column(JSONB, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    terreno: Mapped["Terreno"] = relationship(back_populates="caminos")

    def __repr__(self) -> str:
        etiqueta = self.nombre or self.tipo.value
        return f"<Camino {self.id} {etiqueta} terreno={self.terreno_id}>"
