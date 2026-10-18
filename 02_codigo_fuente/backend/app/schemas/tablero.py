"""
Esquemas de los indicadores del tablero — RF-13.

Son reportes de solo lectura sobre `Cotizacion` y `MaterialCotizado`:
no hay alta ni edición aquí, por eso no hay esquemas de entrada.
"""

from decimal import Decimal

from pydantic import BaseModel

from app.models.cotizacion import EstadoCotizacion


class CotizacionesPorPeriodoLeer(BaseModel):
    periodo: str  # "AAAA-MM", en hora de Ecuador
    cantidad: int
    total: Decimal


class CotizacionesPorEstadoLeer(BaseModel):
    estado: EstadoCotizacion
    cantidad: int


class ClienteFrecuenteLeer(BaseModel):
    cliente_nombre: str
    cantidad: int


class MaterialConsumidoLeer(BaseModel):
    material_id: int
    codigo: str
    nombre: str
    cantidad: int


class ResumenTableroLeer(BaseModel):
    """Las tarjetas numéricas del tablero: totales del rango completo."""

    total_cotizaciones: int
    monto_total: Decimal
    # Suma de L × A × B de cada ítem — los kWp no se pueden calcular
    # todavía porque la cotización no guarda la potencia del panel.
    paneles_cotizados: int


class TableroLeer(BaseModel):
    resumen: ResumenTableroLeer
    cotizaciones_por_periodo: list[CotizacionesPorPeriodoLeer]
    cotizaciones_por_estado: list[CotizacionesPorEstadoLeer]
    clientes_frecuentes: list[ClienteFrecuenteLeer]
    materiales_mas_consumidos: list[MaterialConsumidoLeer]
