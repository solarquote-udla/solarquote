"""
Endpoints de autenticación (RF-11 — Seguridad).

  POST /api/auth/registro  → crear usuario (solo Gerente General)
  POST /api/auth/login     → obtener token
  GET  /api/auth/yo        → datos del usuario autenticado
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_usuario_actual, requiere_gerente
from app.core.security import crear_access_token
from app.models.usuario import Usuario
from app.schemas.usuario import LoginPeticion, Token, UsuarioCrear, UsuarioLeer
from app.services import auth as servicio_auth

router = APIRouter()


@router.post(
    "/registro",
    response_model=UsuarioLeer,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar un usuario nuevo",
    description="Solo el Gerente General puede crear usuarios.",
)
def registrar(
    datos: UsuarioCrear,
    db: Session = Depends(get_db),
    _: Usuario = Depends(requiere_gerente),
) -> Usuario:
    try:
        return servicio_auth.crear_usuario(db, datos)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )


@router.post(
    "/login",
    response_model=Token,
    summary="Iniciar sesión",
)
def login(
    credenciales: LoginPeticion,
    db: Session = Depends(get_db),
) -> Token:
    usuario = servicio_auth.autenticar_usuario(
        db,
        credenciales.email,
        credenciales.password,
    )

    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = crear_access_token(usuario_id=usuario.id, rol=usuario.rol.value)

    return Token(
        access_token=token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        usuario=UsuarioLeer.model_validate(usuario),
    )


@router.get(
    "/yo",
    response_model=UsuarioLeer,
    summary="Datos del usuario autenticado",
)
def usuario_actual(
    usuario: Usuario = Depends(get_usuario_actual),
) -> Usuario:
    return usuario
