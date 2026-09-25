"""
Funciones de seguridad: hashing de contraseñas y tokens JWT.

Decisiones tomadas:
  - bcrypt para las contraseñas (hash lento a propósito, resiste fuerza bruta)
  - JWT firmado con HS256 usando SECRET_KEY del .env
"""

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.core.config import settings

# bcrypt no acepta contraseñas de más de 72 bytes
LONGITUD_MAX_PASSWORD = 72


# ─── Contraseñas ────────────────────────────────────────

def hash_password(password: str) -> str:
    """
    Convierte una contraseña en su hash bcrypt.
    El hash incluye el salt, por eso no hay que guardarlo aparte.
    """
    password_bytes = password.encode("utf-8")

    if len(password_bytes) > LONGITUD_MAX_PASSWORD:
        raise ValueError(
            f"La contraseña no puede superar {LONGITUD_MAX_PASSWORD} bytes"
        )

    return bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode("utf-8")


def verificar_password(password: str, password_hash: str) -> bool:
    """Compara una contraseña en texto plano contra su hash."""
    try:
        return bcrypt.checkpw(
            password.encode("utf-8"),
            password_hash.encode("utf-8"),
        )
    except ValueError:
        # Hash malformado en la base de datos
        return False


# ─── Tokens JWT ─────────────────────────────────────────

def crear_access_token(*, usuario_id: int, rol: str) -> str:
    """
    Genera un token firmado que identifica al usuario.

    El token contiene:
      sub  → id del usuario (estándar JWT: "subject")
      rol  → para autorizar sin consultar la base en cada petición
      exp  → cuándo expira
      iat  → cuándo se emitió
    """
    ahora = datetime.now(timezone.utc)
    expira = ahora + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    payload: dict[str, Any] = {
        "sub": str(usuario_id),
        "rol": rol,
        "iat": ahora,
        "exp": expira,
    }

    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decodificar_access_token(token: str) -> dict[str, Any] | None:
    """
    Valida la firma y la expiración del token.
    Devuelve el payload, o None si el token es inválido o expiró.
    """
    try:
        return jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
