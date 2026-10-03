"""
Schemas del layout solar — RF-03.
"""

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.services.calculo_layout import (
    PANELES_LARGO_DEFECTO,
    PASILLO_DEFECTO_M,
    TOLERANCIA_DEFECTO,
)


class LayoutGenerar(BaseModel):
    """Parámetros que elige el Gerente antes de generar."""

    paneles_largo: int = Field(
        default=PANELES_LARGO_DEFECTO,
        ge=2,
        le=20,
        description="L: paneles en la dirección de la pendiente. Siempre par.",
    )
    pasillo_m: float = Field(
        default=PASILLO_DEFECTO_M,
        ge=0,
        le=20,
        description="Separación entre bloques, en metros",
    )
    tolerancia_proporcion: float = Field(
        default=TOLERANCIA_DEFECTO,
        ge=0.01,
        le=0.5,
        description="Desvío admitido respecto a ancho = 3 × largo (0.2 = ±20 %)",
    )
    capacidad_deseada_kwp: float | None = Field(
        default=None,
        gt=0,
        le=1_000_000,
        description="Opcional. Sin valor, el layout maximiza los paneles.",
    )

    @field_validator("paneles_largo")
    @classmethod
    def validar_par(cls, v: int) -> int:
        if v % 2:
            raise ValueError(
                "L debe ser par: la estructura apoya los paneles de a dos "
                "sobre los soportes en A y en V."
            )
        return v


class BloqueLeer(BaseModel):
    vertices: list[list[float]]
    paneles_largo: int
    paneles_ancho: int
    paneles: int
    proporcion: float
    en_proporcion: bool
    tipo: str


class TipoBloqueLeer(BaseModel):
    tipo: str
    paneles_largo: int
    paneles_ancho: int
    repeticiones: int
    paneles: int
    proporcion: float
    en_proporcion: bool


class CapacidadLeer(BaseModel):
    deseada_kwp: float
    paneles_necesarios: int
    cabe: bool
    maxima_kwp: float
    instalada_kwp: float
    remanente_kwp: float


class ElectricaLeer(BaseModel):
    paneles_por_string_min: int | None
    paneles_por_string_max: int | None
    paneles_por_string: int | None
    strings_totales: int | None
    paneles_sin_string: int | None
    inversores: int
    strings_por_mppt: int | None
    compatible: bool | None
    motivo: str | None


class LayoutLeer(BaseModel):
    proyecto_id: int
    parametros: LayoutGenerar

    bloques: list[BloqueLeer]
    tipos: list[TipoBloqueLeer]

    total_paneles: int
    potencia_kwp: float
    paneles_ancho_ideal: int
    largo_bloque_m: float
    ancho_bloque_m: float
    separacion_este_oeste_m: float
    separacion_norte_sur_m: float
    area_util_m2: float
    area_ocupada_m2: float

    capacidad: CapacidadLeer | None
    electrica: ElectricaLeer
    advertencias: list[str]

    desactualizado: bool = Field(
        description=(
            "El terreno, los caminos, el equipo o la latitud cambiaron "
            "después de generar. Hay que volver a generar."
        )
    )

    created_at: datetime
    updated_at: datetime
