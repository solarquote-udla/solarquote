"""
Usuarios (RF-11 — Seguridad). Exige el permiso `usuarios`.

  GET   /api/usuarios                 → listado con filtros
  GET   /api/usuarios/{id}
  POST  /api/usuarios                 → alta con contraseña temporal
  PATCH /api/usuarios/{id}            → nombre, correo, perfil, activo
  PUT   /api/usuarios/{id}/password   → restablecer con contraseña temporal

No hay DELETE: un usuario se desactiva (baja lógica).
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import requiere_permiso
from app.core.permisos import Permiso
from app.models.usuario import Usuario
from app.schemas.usuario import (
    EstadoUsuario,
    PasswordRestablecer,
    UsuarioActualizar,
    UsuarioCrear,
    UsuarioLeer,
)
from app.services import seguridad as servicio
from app.services.seguridad import ReglaSeguridad

administrador = requiere_permiso(Permiso.USUARIOS)

router = APIRouter(
    prefix="/api/usuarios",
    tags=["Seguridad — Usuarios"],
    dependencies=[Depends(administrador)],
)


def _error(exc: ReglaSeguridad) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.mensaje)


@router.get("", response_model=list[UsuarioLeer])
def listar(
    q: str | None = Query(default=None, max_length=120, description="Busca en nombre y correo"),
    perfil_id: int | None = None,
    estado: EstadoUsuario | None = None,
    db: Session = Depends(get_db),
) -> list[Usuario]:
    return servicio.listar_usuarios(db, busqueda=q, perfil_id=perfil_id, estado=estado)


@router.get("/{usuario_id}", response_model=UsuarioLeer)
def detalle(usuario_id: int, db: Session = Depends(get_db)) -> Usuario:
    try:
        return servicio.obtener_usuario(db, usuario_id)
    except ReglaSeguridad as exc:
        raise _error(exc)


@router.post("", response_model=UsuarioLeer, status_code=status.HTTP_201_CREATED)
def crear(
    datos: UsuarioCrear,
    db: Session = Depends(get_db),
    actor: Usuario = Depends(administrador),
) -> Usuario:
    try:
        return servicio.crear_usuario(db, actor, datos)
    except ReglaSeguridad as exc:
        raise _error(exc)


@router.patch("/{usuario_id}", response_model=UsuarioLeer)
def actualizar(
    usuario_id: int,
    datos: UsuarioActualizar,
    db: Session = Depends(get_db),
    actor: Usuario = Depends(administrador),
) -> Usuario:
    try:
        return servicio.actualizar_usuario(db, actor, servicio.obtener_usuario(db, usuario_id), datos)
    except ReglaSeguridad as exc:
        raise _error(exc)


@router.put("/{usuario_id}/password", response_model=UsuarioLeer)
def restablecer_password(
    usuario_id: int,
    datos: PasswordRestablecer,
    db: Session = Depends(get_db),
    actor: Usuario = Depends(administrador),
) -> Usuario:
    try:
        return servicio.restablecer_password(
            db, actor, servicio.obtener_usuario(db, usuario_id), datos.password_temporal
        )
    except ReglaSeguridad as exc:
        raise _error(exc)
