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
    # Suma de L × A × B de cada ítem.
    paneles_cotizados: int
    # Suma de Cotizacion.potencia_kwp. Solo las cotizaciones que salen de
    # un layout (RF-05) la tienen; las cotizadas al vuelo no cuentan.
    potencia_total_kwp: Decimal


class TableroLeer(BaseModel):
    resumen: ResumenTableroLeer
    cotizaciones_por_periodo: list[CotizacionesPorPeriodoLeer]
    cotizaciones_por_estado: list[CotizacionesPorEstadoLeer]
    clientes_frecuentes: list[ClienteFrecuenteLeer]
    materiales_mas_consumidos: list[MaterialConsumidoLeer]
