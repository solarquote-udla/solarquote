"""
Catálogo de paneles de referencia — RF-02.

Mismo rol que `Inversor` (`app/models/inversor.py`): agiliza la captura en
el Paso 2 — el usuario elige un panel de este catálogo y sus valores
prellenan el formulario, pero `ConfiguracionEquipo` guarda su propia copia
(snapshot), no una referencia a este registro. Si luego se corrige un dato
acá, los proyectos ya configurados no cambian.

Reemplaza la lista fija de `app/data/paneles_referencia.py`: ese archivo
sigue existiendo (lo sigue usando el endpoint viejo de presets) hasta que
el Paso 2 pase a consumir este catálogo.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PanelCatalogo(Base):
    __tablename__ = "paneles"

    __table_args__ = (UniqueConstraint("marca", "modelo", name="ux_panel_marca_modelo"),)

    id: Mapped[int] = mapped_column(primary_key=True)

    marca: Mapped[str] = mapped_column(String(80), nullable=False)
    modelo: Mapped[str] = mapped_column(String(100), nullable=False)
    potencia_wp: Mapped[float] = mapped_column(Float, nullable=False)
    largo_mm: Mapped[float] = mapped_column(Float, nullable=False)
    ancho_mm: Mapped[float] = mapped_column(Float, nullable=False)
    voc_v: Mapped[float] = mapped_column(Float, nullable=False)
    vmp_v: Mapped[float] = mapped_column(Float, nullable=False)

    # Baja lógica: un modelo descontinuado no se borra, se desactiva.
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

    def __repr__(self) -> str:
        return f"<PanelCatalogo {self.marca} {self.modelo}>"
