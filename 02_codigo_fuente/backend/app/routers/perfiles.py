"""
Perfiles y catálogo de permisos (RF-11 — Seguridad).

  GET    /api/permisos          → catálogo de opciones asignables
  GET    /api/perfiles          → perfiles con su cantidad de usuarios
  GET    /api/perfiles/{id}
  POST   /api/perfiles          → crear perfil personalizado
  PATCH  /api/perfiles/{id}     → nombre, descripción o permisos
  DELETE /api/perfiles/{id}     → solo personalizados y sin usuarios

Leer perfiles exige `perfiles` o `usuarios` (el alta de usuarios necesita
la lista); modificarlos exige `perfiles`.
"""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import requiere_permiso
from app.core.permisos import CATALOGO, Permiso
from app.models.perfil import Perfil
from app.schemas.usuario import PerfilActualizar, PerfilCrear, PerfilLeer, PermisoLeer
from app.services import seguridad as servicio
from app.services.seguridad import ReglaSeguridad

router = APIRouter(tags=["Seguridad — Perfiles"])

puede_leer = requiere_permiso(Permiso.PERFILES, Permiso.USUARIOS)
puede_editar = requiere_permiso(Permiso.PERFILES)


def _error(exc: ReglaSeguridad) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.mensaje)


def _respuesta(perfil: Perfil, total_usuarios: int) -> PerfilLeer:
    return PerfilLeer(
        id=perfil.id,
        nombre=perfil.nombre,
        descripcion=perfil.descripcion,
        es_sistema=perfil.es_sistema,
        acceso_total=perfil.acceso_total,
        permisos=sorted(perfil.permisos),
        total_usuarios=total_usuarios,
    )


@router.get("/api/permisos", response_model=list[PermisoLeer], dependencies=[Depends(puede_leer)])
def catalogo() -> list[PermisoLeer]:
    return [
        PermisoLeer(codigo=p.codigo, nombre=p.nombre, grupo=p.grupo, descripcion=p.descripcion)
        for p in CATALOGO
    ]


@router.get("/api/perfiles", response_model=list[PerfilLeer], dependencies=[Depends(puede_leer)])
def listar(db: Session = Depends(get_db)) -> list[PerfilLeer]:
    return [_respuesta(p, n) for p, n in servicio.listar_perfiles(db)]


@router.get("/api/perfiles/{perfil_id}", response_model=PerfilLeer, dependencies=[Depends(puede_leer)])
def detalle(perfil_id: int, db: Session = Depends(get_db)) -> PerfilLeer:
    try:
        perfil = servicio.obtener_perfil(db, perfil_id)
    except ReglaSeguridad as exc:
        raise _error(exc)
    return _respuesta(perfil, servicio.contar_usuarios(db, perfil.id))


@router.post(
    "/api/perfiles",
    response_model=PerfilLeer,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(puede_editar)],
)
def crear(datos: PerfilCrear, db: Session = Depends(get_db)) -> PerfilLeer:
    try:
        perfil = servicio.crear_perfil(db, datos)
    except ReglaSeguridad as exc:
        raise _error(exc)
    return _respuesta(perfil, 0)


@router.patch("/api/perfiles/{perfil_id}", response_model=PerfilLeer, dependencies=[Depends(puede_editar)])
def actualizar(perfil_id: int, datos: PerfilActualizar, db: Session = Depends(get_db)) -> PerfilLeer:
    try:
        perfil = servicio.actualizar_perfil(db, servicio.obtener_perfil(db, perfil_id), datos)
    except ReglaSeguridad as exc:
        raise _error(exc)
    return _respuesta(perfil, servicio.contar_usuarios(db, perfil.id))


@router.delete(
    "/api/perfiles/{perfil_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(puede_editar)],
)
def eliminar(perfil_id: int, db: Session = Depends(get_db)) -> Response:
    try:
        servicio.eliminar_perfil(db, servicio.obtener_perfil(db, perfil_id))
    except ReglaSeguridad as exc:
        raise _error(exc)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
