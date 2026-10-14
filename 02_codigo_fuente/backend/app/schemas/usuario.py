"""
Schemas de Usuario, Perfil y autenticación (Pydantic).

Los schemas definen QUÉ entra y QUÉ sale de la API, separado de los modelos
de base de datos. Esto evita exponer accidentalmente campos sensibles como
`password_hash`, `intentos_fallidos` o `version_token`.
"""

import re
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, EmailStr, Field, field_validator

from app.core.permisos import Permiso
from app.core.security import LONGITUD_MAX_PASSWORD

# ─── Política de contraseñas ────────────────────────────

LONGITUD_MIN_PASSWORD = 8


def _validar_politica(password: str) -> str:
    """Mínimo 8 caracteres, al menos una letra y un número, máximo 72 bytes."""
    if len(password.encode("utf-8")) > LONGITUD_MAX_PASSWORD:
        raise ValueError(f"La contraseña no puede superar {LONGITUD_MAX_PASSWORD} bytes")
    if not re.search(r"[^\W\d_]", password) or not re.search(r"\d", password):
        raise ValueError("La contraseña debe tener al menos una letra y un número")
    if password.strip() != password:
        raise ValueError("La contraseña no puede empezar ni terminar con espacios")
    return password


PasswordNueva = Annotated[
    str,
    Field(min_length=LONGITUD_MIN_PASSWORD, description="Mínimo 8 caracteres, con letras y números"),
    AfterValidator(_validar_politica),
]


def _normalizar_email(valor: str) -> str:
    return valor.strip().lower()


def _colapsar_espacios(valor: object) -> object:
    return " ".join(valor.split()) if isinstance(valor, str) else valor


# Los espacios se colapsan ANTES de medir el largo: "   " no pasa como nombre
NombrePersona = Annotated[str, BeforeValidator(_colapsar_espacios), Field(min_length=2, max_length=120)]


# ─── Perfiles ───────────────────────────────────────────

class PermisoLeer(BaseModel):
    """Una opción del catálogo de permisos."""

    codigo: Permiso
    nombre: str
    grupo: str
    descripcion: str


class PerfilResumen(BaseModel):
    """Perfil tal como se muestra dentro de un usuario."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    es_sistema: bool
    acceso_total: bool


class PerfilLeer(PerfilResumen):
    descripcion: str | None
    permisos: list[Permiso]
    total_usuarios: int = 0


class _PerfilBase(BaseModel):
    @field_validator("nombre", check_fields=False)
    @classmethod
    def _limpiar_nombre(cls, valor: str | None) -> str | None:
        if valor is None:
            return None
        limpio = " ".join(valor.split())
        if len(limpio) < 3:
            raise ValueError("El nombre debe tener al menos 3 caracteres")
        return limpio


class PerfilCrear(_PerfilBase):
    nombre: str = Field(max_length=60)
    descripcion: str | None = Field(default=None, max_length=255)
    permisos: set[Permiso] = Field(default_factory=set)


class PerfilActualizar(_PerfilBase):
    """Solo se cambian los campos enviados."""

    nombre: str | None = Field(default=None, max_length=60)
    descripcion: str | None = Field(default=None, max_length=255)
    permisos: set[Permiso] | None = None


# ─── Usuarios ───────────────────────────────────────────

EstadoUsuario = Literal["activo", "pendiente", "inactivo"]


class UsuarioLeer(BaseModel):
    """Datos que la API devuelve de un usuario. Nunca incluye la contraseña."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    email: EmailStr
    perfil: PerfilResumen
    activo: bool
    debe_cambiar_password: bool
    ultimo_acceso: datetime | None
    created_at: datetime
    estado: EstadoUsuario
    bloqueado: bool


class UsuarioSesion(UsuarioLeer):
    """El usuario autenticado, con sus permisos efectivos para armar el menú."""

    permisos: list[Permiso]

    @field_validator("permisos", mode="before")
    @classmethod
    def _ordenar(cls, valor: object) -> object:
        # `Usuario.permisos` es un set: se ordena para una respuesta estable
        return sorted(valor) if isinstance(valor, (set, frozenset)) else valor


class UsuarioCrear(BaseModel):
    """Alta de un usuario. La contraseña es temporal: se cambia al primer acceso."""

    nombre: NombrePersona
    email: Annotated[EmailStr, AfterValidator(_normalizar_email)]
    password_temporal: PasswordNueva
    perfil_id: int


class UsuarioActualizar(BaseModel):
    """Solo se cambian los campos enviados."""

    nombre: NombrePersona | None = None
    email: Annotated[EmailStr, AfterValidator(_normalizar_email)] | None = None
    perfil_id: int | None = None
    activo: bool | None = None


class PasswordRestablecer(BaseModel):
    """El administrador asigna una nueva contraseña temporal."""

    password_temporal: PasswordNueva


# ─── Autenticación ──────────────────────────────────────

class LoginPeticion(BaseModel):
    """Credenciales para iniciar sesión."""

    email: EmailStr
    password: str = Field(max_length=200)


class CambioPassword(BaseModel):
    password_actual: str = Field(max_length=200)
    password_nueva: PasswordNueva


class Token(BaseModel):
    """Respuesta del login."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Segundos hasta que expire el token")
    usuario: UsuarioSesion
