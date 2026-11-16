"""
Endpoints del catálogo de paneles — RF-02.

  GET   /api/paneles          → listado (?incluir_inactivos=, ?marca=, ?modelo=, ?potencia_wp=, ?q=)
  GET   /api/paneles/{id}     → detalle
  POST  /api/paneles          → alta
  PATCH /api/paneles/{id}     → marca, modelo, datos técnicos, activo

No hay DELETE: un panel descontinuado se desactiva (baja lógica).

`q` es búsqueda libre (coincide con marca o modelo); se combina con
`marca`/`modelo`/`potencia_wp` si se mandan juntos, aunque lo usual es
usar `q` solo o los filtros exactos solos, no ambos a la vez.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import requiere_permiso
from app.core.permisos import Permiso
from app.models.panel import PanelCatalogo
from app.schemas.panel_catalogo import (
    PanelCatalogoActualizar,
    PanelCatalogoCrear,
    PanelCatalogoLeer,
)
from app.services import panel_catalogo as servicio
from app.services.panel_catalogo import PanelDuplicado, PanelIncoherente

# Leer: también desde CÁLCULO (el asistente del Paso 2 prellena con el catálogo).
lectura = requiere_permiso(Permiso.PANELES, Permiso.GENERAR_LAYOUT, Permiso.CARGAR_BOCETO)
administrar = requiere_permiso(Permiso.PANELES)

router = APIRouter(
    prefix="/api/paneles",
    tags=["Paneles"],
    dependencies=[Depends(lectura)],
)


@router.get("", response_model=list[PanelCatalogoLeer])
def listar(
    incluir_inactivos: bool = Query(default=False),
    marca: str | None = Query(default=None, description="Coincidencia parcial, sin distinguir mayúsculas"),
    modelo: str | None = Query(default=None, description="Coincidencia parcial, sin distinguir mayúsculas"),
    potencia_wp: float | None = Query(default=None, description="Potencia exacta en Wp"),
    q: str | None = Query(default=None, description="Búsqueda libre: coincide con marca o modelo"),
    db: Session = Depends(get_db),
) -> list[PanelCatalogo]:
    if q:
        return servicio.buscar_paneles(db, q, incluir_inactivos)
    return servicio.listar_paneles(db, incluir_inactivos, marca=marca, modelo=modelo, potencia_wp=potencia_wp)


@router.get("/{panel_id}", response_model=PanelCatalogoLeer)
def detalle(panel_id: int, db: Session = Depends(get_db)) -> PanelCatalogo:
    panel = servicio.obtener_panel(db, panel_id)
    if panel is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No existe el panel {panel_id}")
    return panel


@router.post(
    "",
    response_model=PanelCatalogoLeer,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(administrar)],
)
def crear(datos: PanelCatalogoCrear, db: Session = Depends(get_db)) -> PanelCatalogo:
    try:
        return servicio.crear_panel(
            db,
            marca=datos.marca,
            modelo=datos.modelo,
            potencia_wp=datos.potencia_wp,
            largo_mm=datos.largo_mm,
            ancho_mm=datos.ancho_mm,
            voc_v=datos.voc_v,
            vmp_v=datos.vmp_v,
        )
    except PanelDuplicado as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.patch("/{panel_id}", response_model=PanelCatalogoLeer, dependencies=[Depends(administrar)])
def actualizar(panel_id: int, datos: PanelCatalogoActualizar, db: Session = Depends(get_db)) -> PanelCatalogo:
    try:
        resultado = servicio.actualizar_panel(db, panel_id, datos)
    except PanelDuplicado as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except PanelIncoherente as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if resultado is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No existe el panel {panel_id}")
    return resultado
