"""Schemas de Inversor — RF-08."""

from typing import Annotated

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field


def _colapsar_espacios(valor: object) -> object:
    return " ".join(valor.split()) if isinstance(valor, str) else valor


# Los espacios se colapsan ANTES de medir el largo: "   " no pasa como marca/modelo
MarcaInversor = Annotated[str, BeforeValidator(_colapsar_espacios), Field(min_length=2, max_length=80)]
ModeloInversor = Annotated[str, BeforeValidator(_colapsar_espacios), Field(min_length=1, max_length=100)]


class InversorLeer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    marca: str
    modelo: str
    potencia_kw: float
    vmax_v: float | None
    vmin_v: float | None
    mppts: int | None
    strings_por_mppt: int | None
    activo: bool


class InversorCrear(BaseModel):
    marca: MarcaInversor
    modelo: ModeloInversor
    potencia_kw: float = Field(gt=0)
    vmax_v: float | None = Field(default=None, gt=0)
    vmin_v: float | None = Field(default=None, gt=0)
    mppts: int | None = Field(default=None, gt=0)
    strings_por_mppt: int | None = Field(default=None, gt=0)


class InversorActualizar(BaseModel):
    marca: MarcaInversor | None = None
    modelo: ModeloInversor | None = None
    potencia_kw: float | None = Field(default=None, gt=0)
    vmax_v: float | None = Field(default=None, gt=0)
    vmin_v: float | None = Field(default=None, gt=0)
    mppts: int | None = Field(default=None, gt=0)
    strings_por_mppt: int | None = Field(default=None, gt=0)
    activo: bool | None = None
