"""
Configuración de equipo del proyecto — Módulo 1 (RF-02).

Panel e inversor se guardan como datos propios del proyecto, no como
referencia a un catálogo. Así lo define el documento de titulación: "no
existe un panel ni un inversor estándar: ambos dependen del proyecto y
del cliente". Los presets de paneles y la lista de inversores de RF-08
solo rellenan el formulario.

Guardar los valores y no una referencia tiene una consecuencia buscada:
si mañana se corrige un inversor en la lista de RF-08, los proyectos ya
configurados no cambian. Es el mismo criterio de snapshot que usa la
cotización con los datos del cliente.

Una sola tabla con panel e inversor juntos: la relación es uno a uno
con el proyecto y siempre se leen a la vez. Separarlos solo agregaría
un join sin beneficio.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ConfiguracionEquipo(Base):
    __tablename__ = "configuraciones_equipo"

    id: Mapped[int] = mapped_column(primary_key=True)

    proyecto_id: Mapped[int] = mapped_column(
        ForeignKey("proyectos.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # ─── Panel ──────────────────────────────────────────────────
    panel_marca: Mapped[str] = mapped_column(String(80), nullable=False)
    panel_modelo: Mapped[str] = mapped_column(String(100), nullable=False)
    panel_potencia_wp: Mapped[float] = mapped_column(nullable=False)
    # Largo = lado mayor, ancho = lado menor, en milímetros como en las
    # fichas técnicas.
    panel_largo_mm: Mapped[float] = mapped_column(nullable=False)
    panel_ancho_mm: Mapped[float] = mapped_column(nullable=False)
    panel_voc_v: Mapped[float] = mapped_column(nullable=False)
    panel_vmp_v: Mapped[float] = mapped_column(nullable=False)
    # Inclinación respecto a la horizontal, en grados.
    angulo_montaje: Mapped[float] = mapped_column(nullable=False)

    # ─── Inversor ───────────────────────────────────────────────
    inversor_marca: Mapped[str] = mapped_column(String(80), nullable=False)
    inversor_modelo: Mapped[str] = mapped_column(String(100), nullable=False)
    inversor_potencia_kw: Mapped[float] = mapped_column(nullable=False)

    # Datos eléctricos opcionales, igual que en RF-08. Sin Vmax y Vmin no
    # se pueden calcular los límites de string; la configuración se
    # guarda igual y la interfaz avisa qué falta.
    inversor_vmax_v: Mapped[float | None] = mapped_column(nullable=True)
    inversor_vmin_v: Mapped[float | None] = mapped_column(nullable=True)
    inversor_mppts: Mapped[int | None] = mapped_column(nullable=True)
    inversor_strings_por_mppt: Mapped[int | None] = mapped_column(nullable=True)

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

    def __repr__(self) -> str:
        return (
            f"<ConfiguracionEquipo proyecto={self.proyecto_id} "
            f"{self.panel_marca} {self.panel_modelo} / "
            f"{self.inversor_marca} {self.inversor_modelo}>"
        )
