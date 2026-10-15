"""
Schemas de Inversor — RF-08.

Mismas reglas de voltaje que `ConfiguracionEquipoGuardar.Inversor`
(app/schemas/equipo.py): si se registran Vmax y Vmin, van los dos juntos
y Vmax debe ser mayor que Vmin — con uno solo no se pueden calcular los
límites de string.
"""

from typing import Annotated

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, model_validator

from app.core.texto import colapsar_espacios

# Los espacios se colapsan ANTES de medir el largo: "   " no pasa como marca/modelo
MarcaInversor = Annotated[str, BeforeValidator(colapsar_espacios), Field(min_length=2, max_length=80)]
ModeloInversor = Annotated[str, BeforeValidator(colapsar_espacios), Field(min_length=1, max_length=100)]


def _validar_voltajes(vmax_v: float | None, vmin_v: float | None) -> None:
    if (vmax_v is None) != (vmin_v is None):
        raise ValueError(
            "Ingresa ambos voltajes (máximo y mínimo) o ninguno. Con uno solo no "
            "se pueden calcular los límites de string."
        )
    if vmax_v is not None and vmin_v is not None and vmax_v <= vmin_v:
        raise ValueError("El voltaje máximo debe ser mayor que el mínimo.")


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

    @model_validator(mode="after")
    def validar_voltajes(self) -> "InversorCrear":
        _validar_voltajes(self.vmax_v, self.vmin_v)
        return self


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

    @model_validator(mode="after")
    def rechazar_null_en_obligatorios(self) -> "InversorActualizar":
        """`{"marca": null}` pasaría el tipo (marca es opcional en el PATCH
        para poder omitirla) pero dejaría la columna NOT NULL en null."""
        enviados = self.model_fields_set
        nulos = [c for c in _CAMPOS_OBLIGATORIOS if c in enviados and getattr(self, c) is None]
        if nulos:
            raise ValueError(f"No se puede borrar: {', '.join(nulos)}")
        return self

    @model_validator(mode="after")
    def validar_voltajes_si_se_envian_los_dos(self) -> "InversorActualizar":
        """
        Solo valida el orden si esta petición trae los dos voltajes: es una
        actualización parcial, así que "falta uno" no se puede juzgar acá —
        el otro puede ya existir en la base. Esa consistencia completa la
        revisa el servicio, con el registro ya fusionado.
        """
        enviados = self.model_fields_set
        if "vmax_v" in enviados and "vmin_v" in enviados:
            _validar_voltajes(self.vmax_v, self.vmin_v)
        return self
