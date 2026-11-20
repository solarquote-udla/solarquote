"""
Condiciones de la proforma por defecto (las de la configuración), para
llenar el formulario de la confirmación antes de editarlas.
"""

from decimal import Decimal

from pydantic import BaseModel


class TramoPagoDefecto(BaseModel):
    nombre: str
    porcentaje: Decimal


class CondicionesPorDefectoLeer(BaseModel):
    plazo_dias: int
    validez_dias: int
    garantia_anios: int
    pagos: list[TramoPagoDefecto]
