"""
Modelos de Perfil y sus permisos (RF-11 — Seguridad).

Un perfil agrupa permisos (ver `app/core/permisos.py`). Cada usuario tiene
exactamente un perfil.

Perfiles del sistema (`clave` no nula), creados por la migración:
  - Gerente General: `acceso_total`, tiene todos los permisos, incluidos
    los que se agreguen en el futuro. No se puede editar ni eliminar.
  - Personal de Producción: empieza con Despacho y Recepción. Se pueden
    ajustar sus permisos, pero no eliminarlo ni renombrarlo.

Los perfiles personalizados (`clave` nula) se crean desde la pantalla de
Perfiles y se pueden eliminar si ningún usuario los tiene asignados.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.permisos import TODOS_LOS_PERMISOS


class Perfil(Base):
    __tablename__ = "perfiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    descripcion: Mapped[str | None] = mapped_column(String(255))

    # Identifica a los perfiles del sistema; nula en los personalizados
    clave: Mapped[str | None] = mapped_column(String(40), unique=True)

    # Solo el Gerente General: pasa cualquier verificación de permiso
    acceso_total: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    permisos_asignados: Mapped[list["PerfilPermiso"]] = relationship(
        back_populates="perfil",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    @property
    def es_sistema(self) -> bool:
        return self.clave is not None

    @property
    def permisos(self) -> set[str]:
        """Códigos efectivos. Con acceso total, el catálogo completo."""
        if self.acceso_total:
            return set(TODOS_LOS_PERMISOS)
        return {p.codigo for p in self.permisos_asignados}

    def asignar_permisos(self, codigos: set[str]) -> None:
        actuales = {p.codigo: p for p in self.permisos_asignados}
        for codigo, fila in actuales.items():
            if codigo not in codigos:
                self.permisos_asignados.remove(fila)
        for codigo in sorted(codigos - actuales.keys()):
            self.permisos_asignados.append(PerfilPermiso(codigo=codigo))

    def __repr__(self) -> str:
        return f"<Perfil {self.id} {self.nombre}>"


class PerfilPermiso(Base):
    __tablename__ = "perfil_permisos"

    perfil_id: Mapped[int] = mapped_column(
        ForeignKey("perfiles.id", ondelete="CASCADE"), primary_key=True
    )
    codigo: Mapped[str] = mapped_column(String(40), primary_key=True)

    perfil: Mapped[Perfil] = relationship(back_populates="permisos_asignados")
