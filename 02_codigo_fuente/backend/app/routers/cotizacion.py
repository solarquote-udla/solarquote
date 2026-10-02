"""
Endpoint de cotización.

  POST /api/cotizacion → crea una cotización, calculando el desglose
                          de materiales contra calc-service.

Solo Gerente General, igual que proyectos y terreno — Personal de
Producción solo tiene acceso al Módulo 5 (ver models/usuario.py).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import requiere_gerente
from app.models.cotizacion import Cotizacion
from app.models.usuario import Usuario
from app.schemas.cotizacion import CotizacionCrear, CotizacionLeer, ResultadoCalculoCotizacion
from app.services import cotizacion as servicio
from app.services.calc_service import CalcServiceError
from app.services.material import PrecioVigenteFaltante
from app.services.proyecto import ClienteNoDisponible

router = APIRouter(
    prefix="/api/cotizacion",
    tags=["Cotización"],
    dependencies=[Depends(requiere_gerente)],
)


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


@router.post("", response_model=CotizacionLeer, status_code=status.HTTP_201_CREATED)
def crear(
    datos: CotizacionCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(requiere_gerente),
) -> CotizacionLeer:
    try:
        cotizacion, calculo = servicio.crear_cotizacion(db, datos, usuario)
    except ClienteNoDisponible as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except PrecioVigenteFaltante as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except CalcServiceError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    return _respuesta(cotizacion, calculo)
