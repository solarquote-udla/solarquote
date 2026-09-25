"""
Dependencias reutilizables de FastAPI.

Aquí vive el control de acceso. Cualquier endpoint que necesite un usuario
autenticado o un rol específico usa estas funciones con `Depends()`.
"""

from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decodificar_access_token
from app.models.usuario import RolUsuario, Usuario
from app.services.auth import obtener_usuario_por_id

# Hace que Swagger muestre el botón "Authorize" para pegar el token
esquema_bearer = HTTPBearer(description="Pega aquí el access_token del login")


def get_usuario_actual(
    credenciales: HTTPAuthorizationCredentials = Depends(esquema_bearer),
    db: Session = Depends(get_db),
) -> Usuario:
    """
    Extrae el usuario del token JWT.

    Uso:
        def mi_endpoint(usuario: Usuario = Depends(get_usuario_actual)):
            ...
    """
    error_credenciales = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales inválidas o token expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decodificar_access_token(credenciales.credentials)
    if payload is None:
        raise error_credenciales

    usuario_id = payload.get("sub")
    if usuario_id is None:
        raise error_credenciales

    try:
        usuario = obtener_usuario_por_id(db, int(usuario_id))
    except (TypeError, ValueError):
        raise error_credenciales

    if usuario is None:
        raise error_credenciales

    # El usuario pudo ser desactivado después de emitido el token
    if not usuario.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta está desactivada",
        )

    return usuario


def requiere_roles(*roles_permitidos: RolUsuario) -> Callable:
    """
    Fábrica de dependencias que restringe un endpoint a ciertos roles.

    Uso:
        @router.get(
            "/precios",
            dependencies=[Depends(requiere_roles(RolUsuario.GERENTE_GENERAL))],
        )
    """

    def verificador(usuario: Usuario = Depends(get_usuario_actual)) -> Usuario:
        if usuario.rol not in roles_permitidos:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para acceder a este recurso",
            )
        return usuario

    return verificador


# Atajos para los dos roles del sistema
requiere_gerente = requiere_roles(RolUsuario.GERENTE_GENERAL)
requiere_produccion = requiere_roles(
    RolUsuario.GERENTE_GENERAL,
    RolUsuario.PERSONAL_PRODUCCION,
)
