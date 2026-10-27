"""
Endpoints de cotización.

  POST /api/cotizaciones          → crea una cotización, calculando el
                                     desglose de materiales contra calc-service
  GET  /api/cotizaciones          → historial, con filtros y paginación (RF-10)
  GET  /api/cotizaciones/{id}     → detalle completo de una cotización (RF-10)

Crear exige poder cotizar (lo mismo que generar un layout o cargar un
boceto); el historial exige el permiso del menú CÁLCULO > Historial, o
GENERAR_LAYOUT (quien genera layouts retoma sus propios proyectos desde
ahí) — igual regla que la ruta /historial del frontend. Los documentos
de la proforma (RF-07) se descargan con el mismo permiso que el detalle:
es la misma información, solo que en Word o Excel.
"""

from datetime import date
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import requiere_permiso
from app.core.permisos import Permiso
from app.models.cotizacion import Cotizacion, EstadoCotizacion
from app.models.usuario import Usuario
from app.schemas.cotizacion import (
    CotizacionCrear,
    CotizacionDetalleLeer,
    CotizacionesPaginaLeer,
    CotizacionLeer,
    CotizacionResumenLeer,
    ItemCotizacionLeer,
    MaterialCotizadoLeer,
    ResultadoCalculoCotizacion,
)
from app.services import cotizacion as servicio
from app.services import documentos
from app.services.calc_service import CalcServiceError
from app.services.cotizacion import ProyectoNoDisponible
from app.services.material import PrecioVigenteFaltante
from app.services.proyecto import ClienteNoDisponible

puede_cotizar = requiere_permiso(Permiso.GENERAR_LAYOUT, Permiso.CARGAR_BOCETO)
puede_ver_historial = requiere_permiso(Permiso.HISTORIAL, Permiso.GENERAR_LAYOUT)

TIPOS_MEDIO_PROFORMA = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

router = APIRouter(prefix="/api/cotizaciones", tags=["Cotización"])

POR_PAGINA_MAXIMO = 100


def _respuesta(cotizacion: Cotizacion, calculo: ResultadoCalculoCotizacion) -> CotizacionLeer:
    return CotizacionLeer(
        id=cotizacion.id,
        numero_proforma=cotizacion.numero_proforma,
        estado=cotizacion.estado,
        cliente_id=cotizacion.cliente_id,
        cliente_nombre=cotizacion.cliente_nombre,
        cliente_empresa=cotizacion.cliente_empresa,
        cliente_email=cotizacion.cliente_email,
        cliente_telefono=cotizacion.cliente_telefono,
        proyecto_id=cotizacion.proyecto_id,
        proyecto_nombre=cotizacion.proyecto_nombre,
        addendum_porcentaje=cotizacion.addendum_porcentaje,
        created_at=cotizacion.created_at,
        updated_at=cotizacion.updated_at,
        calculo=calculo,
    )


def _detalle(cotizacion: Cotizacion) -> CotizacionDetalleLeer:
    return CotizacionDetalleLeer(
        id=cotizacion.id,
        numero_proforma=cotizacion.numero_proforma,
        estado=cotizacion.estado,
        cliente_id=cotizacion.cliente_id,
        cliente_nombre=cotizacion.cliente_nombre,
        cliente_empresa=cotizacion.cliente_empresa,
        cliente_email=cotizacion.cliente_email,
        cliente_telefono=cotizacion.cliente_telefono,
        proyecto_id=cotizacion.proyecto_id,
        proyecto_nombre=cotizacion.proyecto_nombre,
        addendum_porcentaje=cotizacion.addendum_porcentaje,
        subtotal=cotizacion.subtotal,
        addendum_monto=cotizacion.addendum_monto,
        iva_porcentaje=cotizacion.iva_porcentaje,
        iva_monto=cotizacion.iva_monto,
        total=cotizacion.total,
        created_at=cotizacion.created_at,
        updated_at=cotizacion.updated_at,
        items=[ItemCotizacionLeer.model_validate(item) for item in cotizacion.items],
        materiales=[
            MaterialCotizadoLeer(
                material_id=m.material_id,
                codigo=m.material.codigo,
                nombre=m.material.nombre,
                unidad=m.material.unidad,
                cantidad=m.cantidad,
                precio_unitario=m.precio_unitario,
            )
            for m in cotizacion.materiales
        ],
    )


@router.post(
    "",
    response_model=CotizacionLeer,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(puede_cotizar)],
)
def crear(
    datos: CotizacionCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(puede_cotizar),
) -> CotizacionLeer:
    try:
        cotizacion, calculo = servicio.crear_cotizacion(db, datos, usuario)
    except ClienteNoDisponible as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except ProyectoNoDisponible as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except PrecioVigenteFaltante as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except CalcServiceError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    return _respuesta(cotizacion, calculo)


@router.get("", response_model=CotizacionesPaginaLeer, dependencies=[Depends(puede_ver_historial)])
def listar(
    buscar: str | None = Query(default=None, description="Texto libre contra el cliente o el número de proforma"),
    estado: EstadoCotizacion | None = Query(default=None),
    desde: date | None = Query(default=None, description="Emitidas desde esta fecha, inclusive"),
    hasta: date | None = Query(default=None, description="Emitidas hasta esta fecha, inclusive"),
    pagina: int = Query(default=1, ge=1),
    por_pagina: int = Query(default=20, ge=1, le=POR_PAGINA_MAXIMO),
    db: Session = Depends(get_db),
) -> CotizacionesPaginaLeer:
    cotizaciones, total = servicio.listar_cotizaciones(
        db,
        buscar=buscar,
        estado=estado,
        desde=desde,
        hasta=hasta,
        pagina=pagina,
        por_pagina=por_pagina,
    )
    return CotizacionesPaginaLeer(
        resultados=[CotizacionResumenLeer.model_validate(c) for c in cotizaciones],
        total=total,
        pagina=pagina,
        por_pagina=por_pagina,
        total_paginas=max(1, -(-total // por_pagina)),  # división entera hacia arriba
    )


@router.get("/{cotizacion_id}", response_model=CotizacionDetalleLeer, dependencies=[Depends(puede_ver_historial)])
def detalle(cotizacion_id: int, db: Session = Depends(get_db)) -> CotizacionDetalleLeer:
    return _detalle(_obtener_o_404(db, cotizacion_id))


def _obtener_o_404(db: Session, cotizacion_id: int) -> Cotizacion:
    cotizacion = servicio.obtener_cotizacion(db, cotizacion_id)
    if cotizacion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"No existe la cotización {cotizacion_id}"
        )
    return cotizacion


def _respuesta_proforma(cotizacion: Cotizacion, extension: str, contenido: bytes) -> Response:
    return Response(
        content=contenido,
        media_type=TIPOS_MEDIO_PROFORMA[extension],
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(documentos.nombre_archivo(cotizacion, extension))}"
        },
    )


@router.get("/{cotizacion_id}/proforma.docx", dependencies=[Depends(puede_ver_historial)])
def proforma_word(cotizacion_id: int, db: Session = Depends(get_db)) -> Response:
    """Proforma en Word: mismo contenido que el detalle, para enviar al cliente con ajustes propios."""
    cotizacion = _obtener_o_404(db, cotizacion_id)
    return _respuesta_proforma(cotizacion, "docx", documentos.generar_word(cotizacion))


@router.get("/{cotizacion_id}/proforma.xlsx", dependencies=[Depends(puede_ver_historial)])
def proforma_excel(cotizacion_id: int, db: Session = Depends(get_db)) -> Response:
    """Proforma en Excel: mismas cantidades que el Word, en hoja de cálculo."""
    cotizacion = _obtener_o_404(db, cotizacion_id)
    return _respuesta_proforma(cotizacion, "xlsx", documentos.generar_excel(cotizacion))
