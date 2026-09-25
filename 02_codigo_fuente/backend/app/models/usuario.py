"""
Modelo de Usuario.

El sistema tiene dos actores (según el documento capstone):
  - Gerente General      → acceso a todos los módulos
  - Personal de Producción → solo al Módulo 5 (Validación de materiales)
"""

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class RolUsuario(str, enum.Enum):
    """Roles del sistema. El valor es lo que se guarda en la base de datos."""

    GERENTE_GENERAL = "gerente_general"
    PERSONAL_PRODUCCION = "personal_produccion"


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

    rol: Mapped[RolUsuario] = mapped_column(
        SAEnum(RolUsuario, name="rol_usuario", values_callable=lambda e: [i.value for i in e]),
        nullable=False,
    )

    # Baja lógica: en vez de borrar usuarios, se desactivan
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
        return f"<Usuario {self.id} {self.email} ({self.rol.value})>"
