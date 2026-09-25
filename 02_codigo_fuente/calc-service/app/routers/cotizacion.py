from fastapi import APIRouter, HTTPException

from app.schemas.cotizacion import CalcularCotizacionEntrada, CalcularCotizacionSalida
from app.services.cotizacion import armar_cotizacion

router = APIRouter(prefix="/api/cotizacion", tags=["Cotización"])


@router.post("/calcular", response_model=CalcularCotizacionSalida)
def calcular_cotizacion(entrada: CalcularCotizacionEntrada) -> CalcularCotizacionSalida:
    """
    Calcula cantidades de materiales, subtotal, addendum e IVA para una
    cotización a partir de sus ítems (L, A, B) y los precios vigentes.
    """
    try:
        return armar_cotizacion(entrada)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
