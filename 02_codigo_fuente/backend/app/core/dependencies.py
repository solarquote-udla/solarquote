"""
Dependencias reutilizables de FastAPI.

Aquí vive el control de acceso (RF-11). Cada endpoint protegido declara el
permiso que exige:

    @router.get("", dependencies=[Depends(requiere_permiso(Permiso.CLIENTES))])

Orden de las verificaciones en cada petición:
  1. El token es válido, no expiró y su versión coincide con la del
     usuario (401 si no).
  2. La cuenta está activa (403).
  3. El usuario ya cambió su contraseña temporal (403, salvo en los
     endpoints que usan solo `get_usuario_actual`: /yo y cambiar-password).
  4. Su perfil tiene el permiso (403).
"""

from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permisos import Permiso
from app.core.security import decodificar_access_token
from app.models.usuario import Usuario
from app.services.auth import obtener_usuario_por_id

# Hace que Swagger muestre el botón "Authorize" para pegar el token
esquema_bearer = HTTPBearer(description="Pega aquí el access_token del login")

# El frontend reconoce este código para llevar al usuario a cambiar su
# contraseña en lugar de mostrar un error.
DETALLE_CAMBIO_PENDIENTE = "Debes cambiar tu contraseña temporal antes de continuar"


def get_usuario_actual(
    credenciales: HTTPAuthorizationCredentials = Depends(esquema_bearer),
    db: Session = Depends(get_db),
) -> Usuario:
    """
    Extrae el usuario del token JWT. No exige haber cambiado la
    contraseña temporal: úsalo solo en /yo y en cambiar-password. El resto
    de endpoints usa `requiere_permiso` o `get_usuario_habilitado`.
    """
    error_credenciales = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales inválidas o token expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decodificar_access_token(credenciales.credentials)
    if payload is None:
        raise error_credenciales

    try:
        usuario = obtener_usuario_por_id(db, int(payload["sub"]))
    except (KeyError, TypeError, ValueError):
        raise error_credenciales

    if usuario is None:
        raise error_credenciales

    # Contraseña cambiada o restablecida después de emitir el token
    if payload.get("ver") != usuario.version_token:
        raise error_credenciales

    # El usuario pudo ser desactivado después de emitido el token
    if not usuario.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta está desactivada",
        )

    return usuario


def get_usuario_habilitado(usuario: Usuario = Depends(get_usuario_actual)) -> Usuario:
    """Usuario autenticado que ya no tiene una contraseña temporal pendiente."""
    if usuario.debe_cambiar_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=DETALLE_CAMBIO_PENDIENTE,
        )
    return usuario


def requiere_permiso(*permisos: Permiso) -> Callable:
    """
    Fábrica de dependencias: el perfil del usuario debe tener AL MENOS UNO
    de los permisos indicados. El perfil con acceso total pasa siempre.

    Uso:
        @router.get("", dependencies=[Depends(requiere_permiso(Permiso.PRECIOS))])

        def crear(usuario: Usuario = Depends(requiere_permiso(Permiso.GENERAR_LAYOUT))):
            ...
    """
    if not permisos:
        raise ValueError("requiere_permiso necesita al menos un permiso")
    codigos = tuple(p.value for p in permisos)

    def verificador(usuario: Usuario = Depends(get_usuario_habilitado)) -> Usuario:
        if not usuario.tiene_permiso(*codigos):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tu perfil no tiene permiso para esta opción",
            )
        return usuario

    return verificador
