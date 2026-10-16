"""Schemas de Material y su historial de precios — RF-09."""

import re
from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field


def _colapsar_espacios(valor: object) -> object:
    return " ".join(valor.split()) if isinstance(valor, str) else valor


# Los espacios se colapsan ANTES de medir el largo: "   " no pasa como nombre
NombreMaterial = Annotated[str, BeforeValidator(_colapsar_espacios), Field(min_length=2, max_length=150)]


def _validar_codigo(valor: str) -> str:
    """Mayúsculas, dígitos y guion bajo: el código que usan las fórmulas f(L,A,B)."""
    limpio = valor.strip().upper()
    if not re.fullmatch(r"[A-Z0-9_]{2,30}", limpio):
        raise ValueError("El código debe tener de 2 a 30 caracteres: solo letras, números y guion bajo")
    return limpio


CodigoMaterial = Annotated[str, AfterValidator(_validar_codigo)]
UnidadMaterial = Annotated[str, BeforeValidator(_colapsar_espacios), Field(min_length=1, max_length=20)]


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


class MaterialCrear(BaseModel):
    codigo: CodigoMaterial
    nombre: NombreMaterial
    unidad: UnidadMaterial = "unidad"


class MaterialActualizar(BaseModel):
    """El código no se puede cambiar: lo usan las fórmulas f(L,A,B) del cálculo."""

    nombre: NombreMaterial | None = None
    unidad: UnidadMaterial | None = None
    activo: bool | None = None
