"""
Schemas del layout solar — RF-03.
"""

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.equipo import MAX_INVERSORES
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


class BloqueEditar(BaseModel):
    """
    Un bloque tras la edición manual (SQ-64).

    Solo viajan la esquina suroeste y A: el backend reconstruye el
    rectángulo con L, el panel y la orientación del layout. Así el
    cliente no puede mandar un bloque deformado o girado distinto al
    resto.
    """

    origen: list[float] = Field(min_length=2, max_length=2, description="Esquina suroeste [x, y], en metros")
    paneles_ancho: int = Field(ge=1, le=500, description="A: paneles a lo largo de la fila")
    inversor: int | None = Field(
        default=None,
        ge=0,
        lt=MAX_INVERSORES,
        description=(
            "Número del inversor (0 = Inversor 1). Si falta en algún bloque, o no existe ese "
            "inversor, todos los bloques se reparten de nuevo."
        ),
    )


class LayoutEditar(BaseModel):
    """Todos los bloques que quedan. Los que no vienen, se eliminan."""

    bloques: list[BloqueEditar] = Field(min_length=1, max_length=20_000)


class BloqueLeer(BaseModel):
    vertices: list[list[float]]
    paneles_largo: int
    paneles_ancho: int
    paneles: int
    proporcion: float
    en_proporcion: bool
    tipo: str
    inversor: int = Field(description="Número del inversor al que va conectado (0 = Inversor 1)")


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


class InversorLayoutLeer(BaseModel):
    """
    Un inversor de la planta con los bloques que tiene asignados y sus
    strings. Se calcula al leer, con el equipo actual: cambiar los datos
    de un inversor no obliga a volver a generar el layout.
    """

    numero: int = Field(description="1 = Inversor 1")
    marca: str
    modelo: str
    potencia_kw: float
    bloques: int
    paneles: int
    potencia_kwp: float
    relacion_dc_ac: float | None = Field(description="kWp de paneles por kW del inversor")

    paneles_por_string_min: int | None
    paneles_por_string_max: int | None
    paneles_por_string: int | None
    strings: int | None
    paneles_sin_string: int | None
    strings_por_mppt: int | None
    compatible: bool | None = Field(description="Null si faltan datos para evaluarlo")
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
    inversores: list[InversorLayoutLeer]
    inversores_sugeridos: int = Field(description="Regla de HEXtructure: ~400 paneles por inversor")
    advertencias: list[str]

    # Para que el plano pueda editar bloques con la misma geometría que el backend
    angulo_norte: float = Field(description="Grados del norte en sentido horario desde +Y, usados al generar")
    lado_menor_m: float = Field(description="Lo que suma cada panel de A al bloque, en metros")
    ediciones_manuales: int = Field(description="Cambios hechos a mano desde la última generación")

    desactualizado: bool = Field(
        description=(
            "El terreno, los caminos, el equipo o la latitud cambiaron "
            "después de generar. Hay que volver a generar."
        )
    )

    created_at: datetime
    updated_at: datetime
