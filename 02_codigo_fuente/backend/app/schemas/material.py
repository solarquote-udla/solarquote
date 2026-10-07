"""Schemas de Material y su historial de precios — RF-09."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class MaterialLeer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    codigo: str
    nombre: str
    unidad: str
    activo: bool
    precio_vigente: Decimal | None = Field(description="None si todavía no tiene un precio registrado")
    vigente_desde: datetime | None = None


class PrecioMaterialLeer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    precio: Decimal
    vigente_desde: datetime
    vigente_hasta: datetime | None
    created_at: datetime


class PrecioActualizar(BaseModel):
    precio: Decimal = Field(gt=0, decimal_places=2)
