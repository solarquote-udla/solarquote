"""
Schemas de la configuración de equipo — RF-02.

En la API, el panel va anidado para que el contrato se lea solo; en la
tabla va plano porque es uno por proyecto. Los inversores son una lista:
el primero es el "Inversor 1" del plano. El servicio traduce entre
ambas formas.

Reglas del documento de titulación:
  - Ángulo de montaje entre 0 y 90 grados
  - Voc mayor que Vmp
  - Si se registran los voltajes del inversor, Vmax mayor que Vmin (RF-08)
"""

from datetime import datetime

from pydantic import BaseModel, Field, ValidationInfo, field_validator, model_validator


class Panel(BaseModel):
    marca: str = Field(min_length=1, max_length=80)
    modelo: str = Field(min_length=1, max_length=100)
    potencia_wp: float = Field(gt=0, le=1500, description="Potencia nominal en STC")
    largo_mm: float = Field(gt=0, le=5000, description="Lado mayor del panel")
    ancho_mm: float = Field(gt=0, le=5000, description="Lado menor del panel")
    voc_v: float = Field(gt=0, le=200, description="Voltaje de circuito abierto en STC")
    vmp_v: float = Field(gt=0, le=200, description="Voltaje en el punto de máxima potencia en STC")

    # Comparaciones entre dos campos, cada una en el campo declarado
    # después (así `info.data` ya tiene el otro) para que el error del
    # 422 diga junto a cuál poner el mensaje, en vez de solo "body".
    # Todos los campos de este modelo son obligatorios (sin default), así
    # que `info.data` siempre refleja lo que mandó el cliente, no un
    # valor por omisión a medias.

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


class Inversor(BaseModel):
    marca: str = Field(min_length=1, max_length=80)
    modelo: str = Field(min_length=1, max_length=100)
    potencia_kw: float = Field(gt=0, le=10_000)

    # Opcionales, como en RF-08. Sin voltajes no hay límites de string.
    vmax_v: float | None = Field(default=None, gt=0, le=2000)
    vmin_v: float | None = Field(default=None, gt=0, le=2000)
    mppts: int | None = Field(default=None, ge=1, le=50)
    strings_por_mppt: int | None = Field(default=None, ge=1, le=50)

    # "Ambos o ninguno" necesita saber si cada voltaje vino realmente en
    # el request (no solo si terminó en None), y eso solo se sabe con el
    # modelo ya armado — por eso sigue siendo un model_validator, con
    # loc en el cuerpo entero. La comparación Vmax > Vmin, en cambio, solo
    # necesita los valores ya puestos: va en vmin_v, el campo declarado
    # después, para que el 422 diga junto a cuál va el error.
    @model_validator(mode="after")
    def validar_ambos_o_ninguno(self) -> "Inversor":
        if (self.vmax_v is None) != (self.vmin_v is None):
            raise ValueError(
                "Ingresa ambos voltajes del inversor (máximo y mínimo) o "
                "ninguno. Con uno solo no se pueden calcular los límites de string."
            )
        return self

    @field_validator("vmin_v", mode="after")
    @classmethod
    def _vmin_menor_que_vmax(cls, v: float | None, info: ValidationInfo) -> float | None:
        vmax = info.data.get("vmax_v")
        if v is not None and vmax is not None and vmax <= v:
            raise ValueError("El voltaje máximo del inversor debe ser mayor que el mínimo.")
        return v


#: Tope práctico: una planta de 5 MWp con paneles de 550 Wp usa ~23
#: inversores de 400 paneles. Evita listas absurdas por error.
MAX_INVERSORES = 50


class ConfiguracionEquipoGuardar(BaseModel):
    panel: Panel
    angulo_montaje: float = Field(ge=0, le=90, description="Inclinación en grados")
    inversores: list[Inversor] = Field(
        min_length=1,
        max_length=MAX_INVERSORES,
        description="En orden: el primero es el Inversor 1",
    )
    potencia_objetivo_kwp: float | None = Field(
        default=None,
        gt=0,
        le=1_000_000,
        description="Potencia que pide el cliente. Opcional: con ella se sugiere cuántos inversores usar.",
    )


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


class SugerenciaLeer(BaseModel):
    """La "Sugerencia automática" del prototipo, a partir de la potencia objetivo."""

    paneles: int
    potencia_kwp: float
    inversores: int
    paneles_por_inversor: int
    kwp_por_inversor: float


class CalculosEquipo(BaseModel):
    """
    Derivados de la configuración. No se guardan: se recalculan en cada
    lectura, así un cambio en la latitud del proyecto se refleja solo.
    """

    area_panel_m2: float
    separacion: SeparacionFilas | None
    strings: list[LimitesStringLeer | None] = Field(
        description="Límites de string de cada inversor, en el mismo orden; null si le faltan los voltajes",
    )
    sugerencia: SugerenciaLeer | None = Field(description="Null si no hay potencia objetivo")
    advertencias: list[str]


class ConfiguracionEquipoLeer(BaseModel):
    proyecto_id: int
    panel: Panel
    angulo_montaje: float
    inversores: list[Inversor]
    potencia_objetivo_kwp: float | None
    calculos: CalculosEquipo
    created_at: datetime
    updated_at: datetime


class PanelReferenciaLeer(Panel):
    clave: str
    fuente: str = Field(description="Ficha técnica de donde se tomaron los datos")
