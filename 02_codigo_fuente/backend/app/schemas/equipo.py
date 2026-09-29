"""
Schemas de la configuración de equipo — RF-02.

En la API, panel e inversor van anidados para que el contrato se lea
solo; en la tabla van planos porque la relación es uno a uno. El
servicio traduce entre ambas formas.

Reglas del documento de titulación:
  - Ángulo de montaje entre 0 y 90 grados
  - Voc mayor que Vmp
  - Si se registran los voltajes del inversor, Vmax mayor que Vmin (RF-08)
"""

from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class Panel(BaseModel):
    marca: str = Field(min_length=1, max_length=80)
    modelo: str = Field(min_length=1, max_length=100)
    potencia_wp: float = Field(gt=0, le=1500, description="Potencia nominal en STC")
    largo_mm: float = Field(gt=0, le=5000, description="Lado mayor del panel")
    ancho_mm: float = Field(gt=0, le=5000, description="Lado menor del panel")
    voc_v: float = Field(gt=0, le=200, description="Voltaje de circuito abierto en STC")
    vmp_v: float = Field(gt=0, le=200, description="Voltaje en el punto de máxima potencia en STC")

    @model_validator(mode="after")
    def validar_coherencia(self) -> "Panel":
        if self.voc_v <= self.vmp_v:
            raise ValueError(
                "El Voc debe ser mayor que el Vmp. Revisa que no estén "
                "intercambiados: en toda ficha técnica el Voc es el mayor."
            )
        if self.largo_mm < self.ancho_mm:
            raise ValueError(
                "El largo es el lado mayor del panel. Los valores parecen "
                "estar intercambiados con el ancho."
            )
        return self


class Inversor(BaseModel):
    marca: str = Field(min_length=1, max_length=80)
    modelo: str = Field(min_length=1, max_length=100)
    potencia_kw: float = Field(gt=0, le=10_000)

    # Opcionales, como en RF-08. Sin voltajes no hay límites de string.
    vmax_v: float | None = Field(default=None, gt=0, le=2000)
    vmin_v: float | None = Field(default=None, gt=0, le=2000)
    mppts: int | None = Field(default=None, ge=1, le=50)
    strings_por_mppt: int | None = Field(default=None, ge=1, le=50)

    @model_validator(mode="after")
    def validar_voltajes(self) -> "Inversor":
        if (self.vmax_v is None) != (self.vmin_v is None):
            raise ValueError(
                "Ingresa ambos voltajes del inversor (máximo y mínimo) o "
                "ninguno. Con uno solo no se pueden calcular los límites de string."
            )
        if self.vmax_v is not None and self.vmin_v is not None and self.vmax_v <= self.vmin_v:
            raise ValueError("El voltaje máximo del inversor debe ser mayor que el mínimo.")
        return self


class ConfiguracionEquipoGuardar(BaseModel):
    panel: Panel
    angulo_montaje: float = Field(ge=0, le=90, description="Inclinación en grados")
    inversor: Inversor


# ─── Resultados calculados ──────────────────────────────────────────


class SeparacionFilas(BaseModel):
    """Para un panel en posición vertical. Longitudes en metros."""

    elevacion_solar_grados: float = Field(
        description="Altura del sol al mediodía del peor día del año en la latitud del proyecto",
    )
    altura_m: float
    proyeccion_m: float = Field(description="Lo que ocupa la fila en planta")
    sombra_m: float = Field(description="Hueco libre mínimo hasta la fila siguiente")
    paso_minimo_m: float = Field(description="De borde frontal a borde frontal")
    factor_sombra: float = Field(
        description="Sombra por metro de profundidad de fila; RF-03 lo escala por paneles en profundidad",
    )


class LimitesStringLeer(BaseModel):
    paneles_min: int
    paneles_max: int
    compatible: bool
    motivo: str | None


class CalculosEquipo(BaseModel):
    """
    Derivados de la configuración. No se guardan: se recalculan en cada
    lectura, así un cambio en la latitud del proyecto se refleja solo.
    """

    area_panel_m2: float
    separacion: SeparacionFilas | None
    strings: LimitesStringLeer | None
    advertencias: list[str]


class ConfiguracionEquipoLeer(BaseModel):
    proyecto_id: int
    panel: Panel
    angulo_montaje: float
    inversor: Inversor
    calculos: CalculosEquipo
    created_at: datetime
    updated_at: datetime


class PanelReferenciaLeer(Panel):
    clave: str
    fuente: str = Field(description="Ficha técnica de donde se tomaron los datos")
