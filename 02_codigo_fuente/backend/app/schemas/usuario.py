"""
Schemas de Usuario (Pydantic).

Los schemas definen QUÉ entra y QUÉ sale de la API, separado de los modelos
de base de datos. Esto evita exponer accidentalmente campos sensibles como
`password_hash`.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.usuario import RolUsuario


class UsuarioCrear(BaseModel):
    """Datos necesarios para registrar un usuario."""

    nombre: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(
        min_length=8,
        max_length=72,  # límite de bcrypt
        description="Mínimo 8 caracteres",
    )
    rol: RolUsuario


class UsuarioLeer(BaseModel):
    """Datos que la API devuelve de un usuario. Nunca incluye la contraseña."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    email: EmailStr
    rol: RolUsuario
    activo: bool
    created_at: datetime


class LoginPeticion(BaseModel):
    """Credenciales para iniciar sesión."""

    email: EmailStr
    password: str


class Token(BaseModel):
    """Respuesta del login."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Segundos hasta que expire el token")
    usuario: UsuarioLeer
