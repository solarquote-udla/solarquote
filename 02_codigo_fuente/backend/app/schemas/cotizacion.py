"""
Schemas de cálculo de cotización — RF-06.

`ItemCalculoEntrada` y `ResultadoCalculoCotizacion` reflejan el contrato
de `POST /api/cotizacion/calcular` en calc-service: este servicio es
stateless, así que el backend valida la entrada y resuelve la salida
con los mismos nombres de campo, sin traducir nada de por medio.
"""

from decimal import Decimal

from pydantic import BaseModel, Field


class ItemCalculoEntrada(BaseModel):
    """Un bloque de estructura: L (paneles en el largo, par), A (paneles en el ancho), B (bloques)."""

    paneles_largo: int = Field(gt=0, description="L: paneles en el largo (número par)")
    paneles_ancho: int = Field(gt=0, description="A: paneles en el ancho")
    bloques: int = Field(gt=0, description="B: número de bloques iguales")


class ItemCalculado(BaseModel):
    paneles_largo: int
    paneles_ancho: int
    bloques: int
    cantidades: dict[str, int]


class ResultadoCalculoCotizacion(BaseModel):
    items: list[ItemCalculado]
    cantidades_totales: dict[str, int]

    subtotal: Decimal

    addendum_porcentaje: Decimal
    addendum_monto: Decimal

    iva_porcentaje: Decimal
    iva_monto: Decimal

    total: Decimal
