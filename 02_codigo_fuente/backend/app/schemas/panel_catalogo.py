"""
Schemas del catálogo de paneles — RF-02.

Mismas reglas de coherencia que `Panel` (`app/schemas/equipo.py`): el Voc
debe ser mayor que el Vmp, y el largo es el lado mayor (debe ser mayor o
igual al ancho). Se repiten acá en vez de reusar esa clase porque esta
guarda el catálogo administrable (con `activo`, sin ser el snapshot de una
configuración de proyecto).
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

MarcaPanel = Annotated[str, BeforeValidator(colapsar_espacios), Field(min_length=2, max_length=80)]
ModeloPanel = Annotated[str, BeforeValidator(colapsar_espacios), Field(min_length=1, max_length=100)]


class PanelCatalogoLeer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    marca: str
    modelo: str
    potencia_wp: float
    largo_mm: float
    ancho_mm: float
    voc_v: float
    vmp_v: float
    activo: bool


class PanelCatalogoCrear(BaseModel):
    marca: MarcaPanel
    modelo: ModeloPanel
    potencia_wp: float = Field(gt=0, le=1500, description="Potencia nominal en STC")
    largo_mm: float = Field(gt=0, le=5000, description="Lado mayor del panel")
    ancho_mm: float = Field(gt=0, le=5000, description="Lado menor del panel")
    voc_v: float = Field(gt=0, le=200, description="Voltaje de circuito abierto en STC")
    vmp_v: float = Field(gt=0, le=200, description="Voltaje en el punto de máxima potencia en STC")

    # Todos los campos son obligatorios (sin default), así que `info.data`
    # siempre refleja lo que mandó el cliente. Cada comparación va en el
    # campo declarado después del otro, para que el 422 diga junto a cuál
    # ponerla, en vez de solo "body".
    @field_validator("ancho_mm", mode="after")
    @classmethod
    def _ancho_no_mayor_que_largo(cls, v: float, info: ValidationInfo) -> float:
        largo = info.data.get("largo_mm")
        if largo is not None and largo < v:
            raise ValueError(
                "El largo es el lado mayor del panel. Los valores parecen "
                "estar intercambiados con el ancho."
            )
        return v

    @field_validator("vmp_v", mode="after")
    @classmethod
    def _vmp_menor_que_voc(cls, v: float, info: ValidationInfo) -> float:
        voc = info.data.get("voc_v")
        if voc is not None and voc <= v:
            raise ValueError(
                "El Voc debe ser mayor que el Vmp. Revisa que no estén "
                "intercambiados: en toda ficha técnica el Voc es el mayor."
            )
        return v


#: Campos obligatorios en el modelo: PATCH con alguno de estos en `null`
#: rompería el NOT NULL de la base en vez de avisar con un 422 claro.
_CAMPOS_OBLIGATORIOS = ("marca", "modelo", "potencia_wp", "largo_mm", "ancho_mm", "voc_v", "vmp_v", "activo")


class PanelCatalogoActualizar(BaseModel):
    marca: MarcaPanel | None = None
    modelo: ModeloPanel | None = None
    potencia_wp: float | None = Field(default=None, gt=0, le=1500)
    largo_mm: float | None = Field(default=None, gt=0, le=5000)
    ancho_mm: float | None = Field(default=None, gt=0, le=5000)
    voc_v: float | None = Field(default=None, gt=0, le=200)
    vmp_v: float | None = Field(default=None, gt=0, le=200)
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
    def validar_coherencia_si_se_envian_los_dos_lados(self) -> "PanelCatalogoActualizar":
        """
        Solo valida acá cuando esta petición trae los dos lados de una
        regla (voc_v+vmp_v, o largo_mm+ancho_mm): es una actualización
        parcial, el otro lado puede ya existir en la base. Esa coherencia
        completa la revisa el servicio, con el registro ya fusionado.

        Por eso sigue siendo un model_validator (necesita
        `model_fields_set`, no solo los valores) y el 422 de este caso
        sale con loc en el cuerpo entero, no en un campo. En la práctica
        casi no se ve: la pantalla de edición manda siempre los campos
        completos del panel.
        """
        enviados = self.model_fields_set
        if (
            "voc_v" in enviados
            and "vmp_v" in enviados
            and self.voc_v is not None
            and self.vmp_v is not None
            and self.voc_v <= self.vmp_v
        ):
            raise ValueError(
                "El Voc debe ser mayor que el Vmp. Revisa que no estén "
                "intercambiados: en toda ficha técnica el Voc es el mayor."
            )
        if (
            "largo_mm" in enviados
            and "ancho_mm" in enviados
            and self.largo_mm is not None
            and self.ancho_mm is not None
            and self.largo_mm < self.ancho_mm
        ):
            raise ValueError(
                "El largo es el lado mayor del panel. Los valores parecen "
                "estar intercambiados con el ancho."
            )
        return self
