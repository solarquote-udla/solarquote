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
from app.core.dependencies import requiere_permiso
from app.core.permisos import Permiso

# Leer: cualquier opción de CÁLCULO. Crear o corregir: generar layout o boceto.
lectura = requiere_permiso(Permiso.GENERAR_LAYOUT, Permiso.CARGAR_BOCETO, Permiso.HISTORIAL)
escritura = requiere_permiso(Permiso.GENERAR_LAYOUT, Permiso.CARGAR_BOCETO)
from app.models.proyecto import Proyecto
from app.models.usuario import Usuario
from app.schemas.proyecto import ClienteResumen, ProyectoActualizar, ProyectoCrear, ProyectoLeer
from app.services import proyecto as servicio

router = APIRouter(
    prefix="/api/proyectos",
    tags=["Proyectos"],
    dependencies=[Depends(lectura)],
)


def _respuesta(proyecto: Proyecto, avance: servicio.Avance | None = None) -> ProyectoLeer:
    return ProyectoLeer(
        id=proyecto.id,
        nombre=proyecto.nombre,
        cliente=ClienteResumen.model_validate(proyecto.cliente),
        ubicacion=proyecto.ubicacion,
        latitud=proyecto.latitud,
        longitud=proyecto.longitud,
        estado=proyecto.estado,
        notas=proyecto.notas,
        tiene_terreno=avance is not None and proyecto.id in avance.terreno,
        tiene_equipo=avance is not None and proyecto.id in avance.equipo,
        tiene_layout=avance is not None and proyecto.id in avance.layout,
        created_at=proyecto.created_at,
        updated_at=proyecto.updated_at,
    )


@router.get("", response_model=list[ProyectoLeer])
def listar(db: Session = Depends(get_db)) -> list[ProyectoLeer]:
    """Todos los proyectos, los más recientes primero."""
    proyectos = servicio.listar_proyectos(db)
    avance = servicio.avance_de(db, [p.id for p in proyectos])
    return [_respuesta(p, avance) for p in proyectos]


@router.post("", response_model=ProyectoLeer, status_code=status.HTTP_201_CREATED)
def crear(
    datos: ProyectoCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(escritura),
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
    return _respuesta(proyecto)


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
    return _respuesta(proyecto, servicio.avance_de(db, [proyecto_id]))


@router.patch("/{proyecto_id}", response_model=ProyectoLeer, dependencies=[Depends(escritura)])
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
    return _respuesta(proyecto, servicio.avance_de(db, [proyecto_id]))
