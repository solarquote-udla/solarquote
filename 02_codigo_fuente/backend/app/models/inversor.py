"""
Catálogo de inversores de referencia — RF-08.

Igual que los paneles (`app/data/paneles_referencia.py`), estos datos solo
agilizan la captura en RF-02: al configurar el equipo de un proyecto, el
usuario elige un inversor de este catálogo y sus valores prellenan el
formulario, pero `ConfiguracionEquipo` guarda su propia copia (snapshot),
no una referencia a este registro. Si luego se corrige un dato acá, los
proyectos ya configurados no cambian.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Inversor(Base):
    __tablename__ = "inversores"

    __table_args__ = (UniqueConstraint("marca", "modelo", name="ux_inversor_marca_modelo"),)

    id: Mapped[int] = mapped_column(primary_key=True)

    marca: Mapped[str] = mapped_column(String(80), nullable=False)
    modelo: Mapped[str] = mapped_column(String(100), nullable=False)
    potencia_kw: Mapped[float] = mapped_column(Float, nullable=False)

    # Datos eléctricos opcionales, igual que en ConfiguracionEquipo: sin
    # Vmax y Vmin no se pueden calcular los límites de string, pero el
    # inversor se guarda igual y la interfaz avisa qué falta.
    vmax_v: Mapped[float | None] = mapped_column(Float, nullable=True)
    vmin_v: Mapped[float | None] = mapped_column(Float, nullable=True)
    mppts: Mapped[int | None] = mapped_column(Integer, nullable=True)
    strings_por_mppt: Mapped[int | None] = mapped_column(Integer, nullable=True)

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
        return f"<Inversor {self.marca} {self.modelo}>"
