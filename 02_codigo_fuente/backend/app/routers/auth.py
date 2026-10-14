"""
Endpoints de autenticación (RF-11 — Seguridad).

  POST /api/auth/login             → obtener token
  GET  /api/auth/yo                → usuario autenticado, con perfil y permisos
  POST /api/auth/cambiar-password  → cambiar la propia contraseña

El alta de usuarios está en /api/usuarios (routers/usuarios.py).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_usuario_actual
from app.core.security import crear_access_token
from app.models.usuario import Usuario
from app.schemas.usuario import CambioPassword, LoginPeticion, Token, UsuarioSesion
from app.services import auth as servicio_auth

router = APIRouter()


def sesion_de(usuario: Usuario) -> UsuarioSesion:
    return UsuarioSesion.model_validate(usuario)


def _token(usuario: Usuario) -> Token:
    return Token(
        access_token=crear_access_token(usuario_id=usuario.id, version=usuario.version_token),
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        usuario=sesion_de(usuario),
    )


@router.post(
    "/login",
    response_model=Token,
    summary="Iniciar sesión",
    responses={
        401: {"description": "Correo o contraseña incorrectos"},
        403: {"description": "Cuenta desactivada"},
        429: {"description": "Cuenta bloqueada temporalmente por intentos fallidos"},
    },
)
def login(
    credenciales: LoginPeticion,
    db: Session = Depends(get_db),
) -> Token:
    try:
        usuario = servicio_auth.autenticar(db, credenciales.email, credenciales.password)
    except servicio_auth.CredencialesInvalidas:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except servicio_auth.CuentaBloqueada as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
            headers={"Retry-After": str(exc.minutos * 60)},
        )
    except servicio_auth.CuentaDesactivada:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta está desactivada. Contacta al administrador.",
        )

    return _token(usuario)


@router.get(
    "/yo",
    response_model=UsuarioSesion,
    summary="Usuario autenticado, con sus permisos efectivos",
)
def usuario_actual(
    usuario: Usuario = Depends(get_usuario_actual),
) -> UsuarioSesion:
    return sesion_de(usuario)


@router.post(
    "/cambiar-password",
    response_model=Token,
    summary="Cambiar la propia contraseña",
    description=(
        "Sirve también para reemplazar la contraseña temporal del primer acceso. "
        "Los tokens anteriores dejan de valer; la respuesta trae uno nuevo."
    ),
)
def cambiar_password(
    datos: CambioPassword,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
) -> Token:
    try:
        usuario = servicio_auth.cambiar_password(db, usuario, datos.password_actual, datos.password_nueva)
    except servicio_auth.PasswordActualIncorrecta:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La contraseña actual no es correcta",
        )
    except servicio_auth.PasswordRepetida:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La nueva contraseña debe ser distinta de la actual",
        )
    return _token(usuario)
