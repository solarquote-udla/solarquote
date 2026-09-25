"""Esquemas del endpoint que calcula el total de una cotización (RF-06)."""

from decimal import Decimal

from pydantic import BaseModel, Field, field_validator


class ItemEntrada(BaseModel):
    """Un bloque de estructura: L (paneles en el largo, par), A (paneles en el ancho), B (bloques)."""

    paneles_largo: int = Field(gt=0, description="L: paneles en el largo (número par)")
    paneles_ancho: int = Field(gt=0, description="A: paneles en el ancho")
    bloques: int = Field(gt=0, description="B: número de bloques iguales")

    @field_validator("paneles_largo")
    @classmethod
    def validar_largo_par(cls, valor: int) -> int:
        if valor % 2 != 0:
            raise ValueError("paneles_largo (L) debe ser un número par")
        return valor


class CalcularCotizacionEntrada(BaseModel):
    items: list[ItemEntrada] = Field(min_length=1)

    # Precio unitario vigente de cada material, por código (VAR1650, VAR1350, ...).
    # Lo resuelve el backend contra PrecioMaterial antes de llamar a este endpoint.
    precios: dict[str, Decimal]

    addendum_porcentaje: Decimal = Field(default=Decimal("0"), ge=0, le=100)


class ItemCalculado(BaseModel):
    paneles_largo: int
    paneles_ancho: int
    bloques: int
    cantidades: dict[str, int]


class CalcularCotizacionSalida(BaseModel):
    items: list[ItemCalculado]
    cantidades_totales: dict[str, int]

    subtotal: Decimal

    addendum_porcentaje: Decimal
    addendum_monto: Decimal

    iva_porcentaje: Decimal
    iva_monto: Decimal

    total: Decimal
