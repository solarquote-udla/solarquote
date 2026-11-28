"""
GET /api/proforma/condiciones: plazo, validez, garantía, logística y forma
de pago de la configuración. El formulario de la confirmación (Paso 3 y boceto) parte
de estos valores y el Gerente los ajusta para cada cliente (acuerdo con
Santi del 17 de noviembre). Mismo permiso que emitir una cotización.
"""

from fastapi import APIRouter, Depends

from app.core.config import settings
from app.core.dependencies import requiere_permiso
from app.core.permisos import Permiso
from app.schemas.condiciones import CondicionesPorDefectoLeer, TramoPagoDefecto
from app.services.cotizacion import tramos_pago_por_defecto

router = APIRouter(
    prefix="/api/proforma",
    tags=["Cotización"],
    dependencies=[Depends(requiere_permiso(Permiso.GENERAR_LAYOUT, Permiso.CARGAR_BOCETO))],
)


@router.get("/condiciones", response_model=CondicionesPorDefectoLeer)
def condiciones_por_defecto() -> CondicionesPorDefectoLeer:
    return CondicionesPorDefectoLeer(
        plazo_dias=settings.PROFORMA_PLAZO_DIAS,
        validez_dias=settings.PROFORMA_VALIDEZ_DIAS,
        garantia_anios=settings.PROFORMA_GARANTIA_ANIOS,
        logistica_monto=settings.PROFORMA_LOGISTICA_MONTO,
        pagos=[TramoPagoDefecto(nombre=n, porcentaje=p) for n, p in tramos_pago_por_defecto()],
    )
