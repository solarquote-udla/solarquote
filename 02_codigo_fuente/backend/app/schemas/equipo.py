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

# Los soportes A y V de HEXtructure tienen aletas a 7,5° (ficha técnica
# Hex001): es el ángulo de la estructura, no un dato que se elija.
ANGULO_MONTAJE_HEXTRUCTURE = 7.5


class ConfiguracionEquipoGuardar(BaseModel):
    panel: Panel
    angulo_montaje: float = Field(
        default=ANGULO_MONTAJE_HEXTRUCTURE,
        ge=0,
        le=90,
        description="Inclinación en grados: 7,5°, el ángulo de las aletas de los soportes A y V (ficha Hex001)",
    )
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


class LimitesStringLeer(BaseModel):
    paneles_min: int
    paneles_max: int
    compatible: bool
    motivo: str | None


class AnalisisInversoresLeer(BaseModel):
    """Relación DC/AC, entradas y sugerencia de inversores (referencia: nunca bloquea)."""

    paneles: int
    potencia_dc_kwp: float
    potencia_ac_kw: float
    relacion_dc_ac: float = Field(description="kWp de paneles ÷ kW de inversores")
    estado: str = Field(description="reserva (DC/AC < 1), normal o recorte (DC/AC > relacion_maxima)")
    relacion_maxima: float
    paneles_admitidos: int | None = Field(
        description="MPPT × strings por MPPT × paneles por string, sumado; null si faltan datos de algún inversor"
    )
    sugeridos: int = Field(description="Con el modelo del inversor 1: el mayor entre la cuenta por potencia y por entradas")
    cuenta: str = Field(description="La cuenta de la sugerencia, para mostrarla")
    mensajes: list[str]


class OcupacionLeer(BaseModel):
    """Si los paneles de la potencia objetivo caben en el terreno."""

    paneles: int
    area_paneles_m2: float
    area_terreno_m2: float = Field(description="Área útil: terreno menos caminos")
    porcentaje: float
    cabe: bool
    maximo_paneles: int = Field(description="Paneles que entran pegados, sin pasillos: cota superior")
    mensaje: str | None


class CalculosEquipo(BaseModel):
    """
    Derivados de la configuración. No se guardan: se recalculan en cada
    lectura, así un cambio en el terreno se refleja solo.
    """

    area_panel_m2: float
    strings: list[LimitesStringLeer | None] = Field(
        description="Límites de string de cada inversor, en el mismo orden; null si le faltan los voltajes",
    )
    inversores: AnalisisInversoresLeer | None = Field(description="Null si no hay potencia objetivo")
    ocupacion: OcupacionLeer | None = Field(description="Null si no hay potencia objetivo o terreno")
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
