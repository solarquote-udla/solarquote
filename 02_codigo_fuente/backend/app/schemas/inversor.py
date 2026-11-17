"""
Schemas de Inversor — RF-08.

Mismas reglas de voltaje que `ConfiguracionEquipoGuardar.Inversor`
(app/schemas/equipo.py): si se registran Vmax y Vmin, van los dos juntos
y Vmax debe ser mayor que Vmin — con uno solo no se pueden calcular los
límites de string.
"""

from typing import Annotated

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    ValidationInfo,
    field_validator,
    model_validator,
)

from app.core.texto import colapsar_espacios

# Los espacios se colapsan ANTES de medir el largo: "   " no pasa como marca/modelo
MarcaInversor = Annotated[str, BeforeValidator(colapsar_espacios), Field(min_length=2, max_length=80)]
ModeloInversor = Annotated[str, BeforeValidator(colapsar_espacios), Field(min_length=1, max_length=100)]


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
    potencia_kw: float = Field(gt=0, le=10_000)
    vmax_v: float | None = Field(default=None, gt=0, le=2000)
    vmin_v: float | None = Field(default=None, gt=0, le=2000)
    mppts: int | None = Field(default=None, ge=1, le=50)
    strings_por_mppt: int | None = Field(default=None, ge=1, le=50)

    # "Ambos o ninguno" necesita el modelo ya armado para saber si cada
    # voltaje vino realmente en el request, así que sigue siendo un
    # model_validator (loc en el cuerpo entero). La comparación Vmax >
    # Vmin solo necesita los valores: va en vmin_v (el campo declarado
    # después), para que el 422 diga junto a cuál va el error.
    @model_validator(mode="after")
    def validar_ambos_o_ninguno(self) -> "InversorCrear":
        if (self.vmax_v is None) != (self.vmin_v is None):
            raise ValueError(
                "Ingresa ambos voltajes (máximo y mínimo) o ninguno. Con uno solo no "
                "se pueden calcular los límites de string."
            )
        return self

    @field_validator("vmin_v", mode="after")
    @classmethod
    def _vmin_menor_que_vmax(cls, v: float | None, info: ValidationInfo) -> float | None:
        vmax = info.data.get("vmax_v")
        if v is not None and vmax is not None and vmax <= v:
            raise ValueError("El voltaje máximo debe ser mayor que el mínimo.")
        return v


#: Campos obligatorios en el modelo: PATCH con alguno de estos en `null`
#: rompería el NOT NULL de la base en vez de avisar con un 422 claro.
_CAMPOS_OBLIGATORIOS = ("marca", "modelo", "potencia_kw", "activo")


class InversorActualizar(BaseModel):
    marca: MarcaInversor | None = None
    modelo: ModeloInversor | None = None
    potencia_kw: float | None = Field(default=None, gt=0, le=10_000)
    vmax_v: float | None = Field(default=None, gt=0, le=2000)
    vmin_v: float | None = Field(default=None, gt=0, le=2000)
    mppts: int | None = Field(default=None, ge=1, le=50)
    strings_por_mppt: int | None = Field(default=None, ge=1, le=50)
    activo: bool | None = None

    # Un field_validator no corre si el campo se omite (toma su default
    # sin pasar por acá) y sí corre si se manda explícito, aunque sea en
    # null — así se distingue "no lo mandaron" de "lo mandaron en null"
    # sin necesitar `model_fields_set`, y cada campo obligatorio que
    # llegue en null cae con su propio loc, no uno combinado.
    @field_validator(*_CAMPOS_OBLIGATORIOS, mode="after")
    @classmethod
    def _no_borrar_obligatorio(cls, v: object, info: ValidationInfo) -> object:
        if v is None:
            raise ValueError(f"No se puede borrar: {info.field_name}")
        return v

    @model_validator(mode="after")
    def validar_voltajes_si_se_envian_los_dos(self) -> "InversorActualizar":
        """
        Solo valida el orden si esta petición trae los dos voltajes: es una
        actualización parcial, así que "falta uno" no se puede juzgar acá —
        el otro puede ya existir en la base. Esa consistencia completa la
        revisa el servicio, con el registro ya fusionado.

        Por eso sigue siendo un model_validator (necesita
        `model_fields_set`, no solo los valores) y el 422 de este caso
        sale con loc en el cuerpo entero, no en un campo. En la práctica
        casi no se ve: la pantalla de edición manda siempre los dos
        voltajes juntos cuando toca alguno.
        """
        enviados = self.model_fields_set
        if "vmax_v" in enviados and "vmin_v" in enviados:
            if (self.vmax_v is None) != (self.vmin_v is None):
                raise ValueError(
                    "Ingresa ambos voltajes (máximo y mínimo) o ninguno. Con uno solo no "
                    "se pueden calcular los límites de string."
                )
            if self.vmax_v is not None and self.vmin_v is not None and self.vmax_v <= self.vmin_v:
                raise ValueError("El voltaje máximo debe ser mayor que el mínimo.")
        return self
