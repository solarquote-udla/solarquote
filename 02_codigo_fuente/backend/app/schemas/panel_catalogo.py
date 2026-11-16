"""
Schemas del catálogo de paneles — RF-02.

Mismas reglas de coherencia que `Panel` (`app/schemas/equipo.py`): el Voc
debe ser mayor que el Vmp, y el largo es el lado mayor (debe ser mayor o
igual al ancho). Se repiten acá en vez de reusar esa clase porque esta
guarda el catálogo administrable (con `activo`, sin ser el snapshot de una
configuración de proyecto).
"""

from typing import Annotated

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, model_validator

from app.core.texto import colapsar_espacios

MarcaPanel = Annotated[str, BeforeValidator(colapsar_espacios), Field(min_length=2, max_length=80)]
ModeloPanel = Annotated[str, BeforeValidator(colapsar_espacios), Field(min_length=1, max_length=100)]


def _validar_coherencia(voc_v: float, vmp_v: float, largo_mm: float, ancho_mm: float) -> None:
    if voc_v <= vmp_v:
        raise ValueError(
            "El Voc debe ser mayor que el Vmp. Revisa que no estén intercambiados: "
            "en toda ficha técnica el Voc es el mayor."
        )
    if largo_mm < ancho_mm:
        raise ValueError(
            "El largo es el lado mayor del panel. Los valores parecen estar "
            "intercambiados con el ancho."
        )


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

    @model_validator(mode="after")
    def validar_coherencia(self) -> "PanelCatalogoCrear":
        _validar_coherencia(self.voc_v, self.vmp_v, self.largo_mm, self.ancho_mm)
        return self


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

    @model_validator(mode="after")
    def rechazar_null_en_obligatorios(self) -> "PanelCatalogoActualizar":
        """`{"marca": null}` pasaría el tipo (marca es opcional en el PATCH
        para poder omitirla) pero dejaría la columna NOT NULL en null."""
        enviados = self.model_fields_set
        nulos = [c for c in _CAMPOS_OBLIGATORIOS if c in enviados and getattr(self, c) is None]
        if nulos:
            raise ValueError(f"No se puede borrar: {', '.join(nulos)}")
        return self

    @model_validator(mode="after")
    def validar_coherencia_si_se_envian_los_dos_lados(self) -> "PanelCatalogoActualizar":
        """
        Solo valida acá cuando esta petición trae los dos lados de una
        regla (voc_v+vmp_v, o largo_mm+ancho_mm): es una actualización
        parcial, el otro lado puede ya existir en la base. Esa coherencia
        completa la revisa el servicio, con el registro ya fusionado.
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
