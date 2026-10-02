"""
Endpoints de proyectos.

  GET  /api/proyectos        → listado
  POST /api/proyectos        → alta
  GET  /api/proyectos/{id}   → detalle
  PATCH /api/proyectos/{id}  → corregir nombre, ubicación, coordenadas o notas

Solo Gerente General. El terreno de cada proyecto se gestiona en
`routers/terreno.py`, bajo /api/proyectos/{id}/terreno.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import requiere_gerente
from app.models.proyecto import Proyecto
from app.models.usuario import Usuario
from app.schemas.proyecto import ClienteResumen, ProyectoActualizar, ProyectoCrear, ProyectoLeer
from app.services import proyecto as servicio

router = APIRouter(
    prefix="/api/proyectos",
    tags=["Proyectos"],
    dependencies=[Depends(requiere_gerente)],
)


def _respuesta(proyecto: Proyecto, tiene_terreno: bool) -> ProyectoLeer:
    return ProyectoLeer(
        id=proyecto.id,
        nombre=proyecto.nombre,
        cliente=ClienteResumen.model_validate(proyecto.cliente),
        ubicacion=proyecto.ubicacion,
        latitud=proyecto.latitud,
        longitud=proyecto.longitud,
        estado=proyecto.estado,
        notas=proyecto.notas,
        tiene_terreno=tiene_terreno,
        created_at=proyecto.created_at,
        updated_at=proyecto.updated_at,
    )


@router.get("", response_model=list[ProyectoLeer])
def listar(db: Session = Depends(get_db)) -> list[ProyectoLeer]:
    """Todos los proyectos, los más recientes primero."""
    proyectos = servicio.listar_proyectos(db)
    con_terreno = servicio.ids_con_terreno(db, [p.id for p in proyectos])
    return [_respuesta(p, p.id in con_terreno) for p in proyectos]


@router.post("", response_model=ProyectoLeer, status_code=status.HTTP_201_CREATED)
def crear(
    datos: ProyectoCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(requiere_gerente),
) -> ProyectoLeer:
    """Registra un proyecto nuevo, en estado borrador."""
    try:
        proyecto = servicio.crear_proyecto(db, datos, usuario)
    except servicio.ClienteNoDisponible as exc:
        # 422 y no 404: el recurso que falta viene dentro del cuerpo,
        # no en la URL. La petición está bien formada pero no se puede
        # procesar con esos datos.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    return _respuesta(proyecto, tiene_terreno=False)


def _proyecto_o_404(db: Session, proyecto_id: int) -> Proyecto:
    proyecto = servicio.obtener_proyecto(db, proyecto_id)
    if proyecto is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe el proyecto {proyecto_id}",
        )
    return proyecto


@router.get("/{proyecto_id}", response_model=ProyectoLeer)
def detalle(proyecto_id: int, db: Session = Depends(get_db)) -> ProyectoLeer:
    proyecto = _proyecto_o_404(db, proyecto_id)
    tiene_terreno = proyecto_id in servicio.ids_con_terreno(db, [proyecto_id])
    return _respuesta(proyecto, tiene_terreno)


@router.patch("/{proyecto_id}", response_model=ProyectoLeer)
def actualizar(
    proyecto_id: int,
    datos: ProyectoActualizar,
    db: Session = Depends(get_db),
) -> ProyectoLeer:
    """
    Corrige los datos descriptivos del proyecto. Cliente y estado no se
    editan por aquí (ver `ProyectoActualizar`).
    """
    proyecto = servicio.actualizar_proyecto(db, _proyecto_o_404(db, proyecto_id), datos)
    tiene_terreno = proyecto_id in servicio.ids_con_terreno(db, [proyecto_id])
    return _respuesta(proyecto, tiene_terreno)
