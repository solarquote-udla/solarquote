"""
Modelo de Usuario (RF-11 — Seguridad).

Cada usuario tiene un perfil, y el perfil define qué opciones del menú
puede usar (ver `app/models/perfil.py`). Los actores del documento
capstone —Gerente General y Personal de Producción— son los dos perfiles
del sistema; el Gerente General puede crear perfiles adicionales.

Seguridad de la cuenta:
  - `password_hash`: hash bcrypt, nunca la contraseña.
  - `debe_cambiar_password`: el administrador asigna una contraseña
    temporal; hasta cambiarla, el usuario solo puede cambiar su
    contraseña.
  - `intentos_fallidos` / `bloqueado_hasta`: bloqueo temporal tras varios
    intentos fallidos de login.
  - `version_token`: viaja dentro del JWT. Al cambiar o restablecer la
    contraseña, o al desactivar la cuenta, se incrementa y los tokens
    emitidos antes dejan de valer.
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.perfil import Perfil


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True)

    nombre: Mapped[str] = mapped_column(String(120), nullable=False)

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
    )

    # Nunca se guarda la contraseña en texto plano — solo su hash bcrypt
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    perfil_id: Mapped[int] = mapped_column(
        ForeignKey("perfiles.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    perfil: Mapped[Perfil] = relationship(lazy="joined")

    # Baja lógica: en vez de borrar usuarios, se desactivan
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    debe_cambiar_password: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    ultimo_acceso: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    intentos_fallidos: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False
    )
    bloqueado_hasta: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version_token: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False
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

    @property
    def bloqueado(self) -> bool:
        """Bloqueo temporal vigente por intentos fallidos de login."""
        return self.bloqueado_hasta is not None and self.bloqueado_hasta > datetime.now(timezone.utc)

    @property
    def estado(self) -> str:
        """Como se muestra en la pantalla de Usuarios."""
        if not self.activo:
            return "inactivo"
        if self.debe_cambiar_password:
            return "pendiente"  # aún no cambia la contraseña temporal
        return "activo"

    @property
    def permisos(self) -> set[str]:
        return self.perfil.permisos

    def tiene_permiso(self, *codigos: str) -> bool:
        """True si tiene al menos uno de los permisos."""
        efectivos = self.permisos
        return any(c in efectivos for c in codigos)

    def __repr__(self) -> str:
        return f"<Usuario {self.id} {self.email}>"
