"""
Cliente HTTP hacia calc-service (RF-06, SQ-77 parte 2/3).

calc-service es stateless: recibe items + precios ya resueltos y
devuelve cantidades, subtotal y total. Este módulo solo habla el
protocolo HTTP; quién resuelve los precios y persiste el resultado
es el orquestador (parte 3/3).
"""

from decimal import Decimal

import httpx

from app.core.config import settings
from app.schemas.cotizacion import ItemCalculoEntrada, ResultadoCalculoCotizacion

TIMEOUT_SEGUNDOS = 10.0


class CalcServiceError(Exception):
    """calc-service no respondió o rechazó la solicitud."""


def calcular_via_calc_service(
    *,
    items: list[ItemCalculoEntrada],
    precios: dict[str, Decimal],
    cargos_fijos: dict[str, int],
    addendum_porcentaje: Decimal,
    iva_porcentaje: Decimal,
) -> ResultadoCalculoCotizacion:
    payload = {
        "items": [item.model_dump() for item in items],
        "precios": {codigo: str(precio) for codigo, precio in precios.items()},
        "cargos_fijos": cargos_fijos,
        "addendum_porcentaje": str(addendum_porcentaje),
        "iva_porcentaje": str(iva_porcentaje),
    }

    try:
        respuesta = httpx.post(
            f"{settings.CALC_SERVICE_URL}/api/cotizacion/calcular",
            json=payload,
            timeout=TIMEOUT_SEGUNDOS,
        )
    except httpx.RequestError as exc:
        raise CalcServiceError(f"No se pudo conectar con calc-service: {exc}") from exc

    if respuesta.status_code != 200:
        raise CalcServiceError(f"calc-service rechazó la solicitud: {respuesta.text}")

    return ResultadoCalculoCotizacion.model_validate(respuesta.json())
