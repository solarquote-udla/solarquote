"""
Endpoints de configuración de equipo — RF-02.

  GET /api/proyectos/{id}/equipo          → configuración con cálculos
  PUT /api/proyectos/{id}/equipo          → crear o reemplazar
  GET /api/equipo/paneles-referencia      → presets para el formulario

PUT y no POST + PATCH: la configuración es una sola por proyecto y panel
e inversor se validan en conjunto, así que siempre se envía entera. PUT
es idempotente: repetir el mismo envío deja el mismo resultado.

Solo Gerente General (RF-02: "solo los usuarios con permiso pueden
configurar los equipos").
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import requiere_gerente
from app.data.paneles_referencia import PANELES_REFERENCIA
from app.schemas.equipo import (
    ConfiguracionEquipoGuardar,
    ConfiguracionEquipoLeer,
    PanelReferenciaLeer,
)
from app.services import equipo as servicio
from app.services.proyecto import obtener_proyecto

router = APIRouter(
    tags=["Módulo 1 — Equipo"],
    dependencies=[Depends(requiere_gerente)],
)


def _proyecto_o_404(db: Session, proyecto_id: int):
    proyecto = obtener_proyecto(db, proyecto_id)
    if proyecto is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe el proyecto {proyecto_id}",
        )
    return proyecto


@router.get(
    "/api/proyectos/{proyecto_id}/equipo",
    response_model=ConfiguracionEquipoLeer,
)
def consultar_equipo(proyecto_id: int, db: Session = Depends(get_db)) -> ConfiguracionEquipoLeer:
    """Configuración de panel e inversor, con los valores calculados."""
    proyecto = _proyecto_o_404(db, proyecto_id)
    configuracion = servicio.obtener_configuracion(db, proyecto_id)
    if configuracion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"El proyecto {proyecto_id} todavía no tiene equipo configurado",
        )
    return servicio.a_respuesta(configuracion, proyecto)


@router.put(
    "/api/proyectos/{proyecto_id}/equipo",
    response_model=ConfiguracionEquipoLeer,
)
def guardar_equipo(
    proyecto_id: int,
    datos: ConfiguracionEquipoGuardar,
    db: Session = Depends(get_db),
) -> ConfiguracionEquipoLeer:
    """
    Crea o reemplaza la configuración. Si el proyecto estaba en
    borrador, pasa a en_diseño.
    """
    proyecto = _proyecto_o_404(db, proyecto_id)
    configuracion = servicio.guardar_configuracion(db, proyecto, datos)
    return servicio.a_respuesta(configuracion, proyecto)


@router.get(
    "/api/equipo/paneles-referencia",
    response_model=list[PanelReferenciaLeer],
)
def paneles_referencia() -> list[PanelReferenciaLeer]:
    """
    Presets de paneles de marcas comunes, con la ficha técnica de origen.
    Solo rellenan el formulario; todos los valores son editables.
    """
    return [PanelReferenciaLeer(**panel) for panel in PANELES_REFERENCIA]
