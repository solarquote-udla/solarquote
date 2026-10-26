"""Esquemas de la validación de materiales — RF-14, RF-15 y RF-16."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.cotizacion import EstadoCotizacion

EstadoItemRecepcion = Literal["ok", "diferencia", "pendiente"]

# Fotos por envío: un lote se fotografía por partes, no hace falta más
MAXIMO_FOTOS = 6
MAXIMO_CANTIDAD = 1_000_000


def _texto_obligatorio(valor: str) -> str:
    valor = valor.strip()
    if not valor:
        raise ValueError("Este campo es obligatorio.")
    return valor


def _texto_opcional(valor: str | None) -> str | None:
    if valor is None:
        return None
    return valor.strip() or None


# ─── Entrada ────────────────────────────────────────────────────────


class ItemDespachoEntrada(BaseModel):
    material_id: int
    cantidad_despachada: int = Field(ge=0, le=MAXIMO_CANTIDAD)
    # Lo que contó la IA en las fotos de este material, si se usó
    conteo_ia: int | None = Field(default=None, ge=0, le=MAXIMO_CANTIDAD)


class FotoDespachoEntrada(BaseModel):
    """Datos de cada foto enviada, en el mismo orden que los archivos."""

    material_id: int
    conteo_ia: int | None = Field(default=None, ge=0, le=MAXIMO_CANTIDAD)


class DespachoCrear(BaseModel):
    fabricado_por: str = Field(max_length=120)
    soldado_por: str = Field(max_length=120)
    contado_por: str = Field(max_length=120)
    despachado_por: str = Field(max_length=120)
    destino: str = Field(max_length=200)
    justificacion: str | None = Field(default=None, max_length=2000)
    items: list[ItemDespachoEntrada] = Field(min_length=1, max_length=100)
    fotos: list[FotoDespachoEntrada] = Field(default_factory=list, max_length=MAXIMO_FOTOS)

    _obligatorios = field_validator("fabricado_por", "soldado_por", "contado_por", "despachado_por", "destino")(
        _texto_obligatorio
    )
    _opcional = field_validator("justificacion")(_texto_opcional)


class ItemRecepcionEntrada(BaseModel):
    material_id: int
    estado: EstadoItemRecepcion
    cantidad_recibida: int | None = Field(default=None, ge=0, le=MAXIMO_CANTIDAD)
    observacion: str | None = Field(default=None, max_length=500)

    _opcional = field_validator("observacion")(_texto_opcional)

    @model_validator(mode="after")
    def _coherencia(self) -> "ItemRecepcionEntrada":
        if self.estado == "diferencia":
            if self.cantidad_recibida is None:
                raise ValueError("Indica la cantidad recibida del material con diferencia.")
            if not self.observacion:
                raise ValueError("Toda diferencia debe quedar registrada con una observación.")
        if self.estado == "pendiente" and self.cantidad_recibida is not None:
            raise ValueError("Un material pendiente todavía no tiene cantidad recibida.")
        return self


class RecepcionCrear(BaseModel):
    recibido_por: str = Field(max_length=120)
    observaciones: str | None = Field(default=None, max_length=2000)
    items: list[ItemRecepcionEntrada] = Field(min_length=1, max_length=100)

    _obligatorio = field_validator("recibido_por")(_texto_obligatorio)
    _opcional = field_validator("observaciones")(_texto_opcional)


# ─── Salida ─────────────────────────────────────────────────────────


class MaterialAValidarLeer(BaseModel):
    """Un material de la cotización, con la cantidad que se cotizó."""

    material_id: int
    codigo: str
    nombre: str
    unidad: str
    cantidad: int


class FotoLeer(BaseModel):
    id: int
    nombre_archivo: str
    material_id: int | None
    conteo_ia: int | None


class ItemDespachoLeer(BaseModel):
    material_id: int
    codigo: str
    nombre: str
    cantidad_cotizada: int
    cantidad_despachada: int
    conteo_ia: int | None
    diferencia: int = Field(description="Despachada − cotizada")


class DespachoLeer(BaseModel):
    fabricado_por: str
    soldado_por: str
    contado_por: str
    despachado_por: str
    destino: str
    justificacion: str | None
    registrado_por: str
    created_at: datetime
    items: list[ItemDespachoLeer]
    fotos: list[FotoLeer]
    con_diferencias: bool


class ItemRecepcionLeer(BaseModel):
    material_id: int
    codigo: str
    nombre: str
    cantidad_esperada: int
    cantidad_recibida: int | None
    estado: EstadoItemRecepcion
    observacion: str | None
    diferencia: int | None = Field(description="Recibida − esperada; nula si está pendiente")


class RecepcionLeer(BaseModel):
    recibido_por: str
    observaciones: str | None
    registrado_por: str
    created_at: datetime
    items: list[ItemRecepcionLeer]
    fotos: list[FotoLeer]
    revisados: int
    diferencias: int
    pendientes: int


class EventoEstadoLeer(BaseModel):
    """Un punto de la línea de tiempo de la propuesta (RF-16)."""

    estado: EstadoCotizacion
    alcanzado: bool
    fecha: datetime | None
    responsable: str | None


class ValidacionLeer(BaseModel):
    """Todo lo de una cotización que interesa al despacho, la recepción y el seguimiento."""

    cotizacion_id: int
    numero_proforma: str | None
    cliente_nombre: str
    cliente_empresa: str | None
    proyecto_nombre: str | None
    estado: EstadoCotizacion
    created_at: datetime
    materiales: list[MaterialAValidarLeer]
    despacho: DespachoLeer | None
    recepcion: RecepcionLeer | None
    linea_tiempo: list[EventoEstadoLeer]


class CotizacionAValidarLeer(BaseModel):
    """Fila de la lista de cotizaciones por despachar o por recibir."""

    cotizacion_id: int
    numero_proforma: str | None
    cliente_nombre: str
    proyecto_nombre: str | None
    estado: EstadoCotizacion
    created_at: datetime
    fecha_despacho: datetime | None


class ConteoVarillasLeer(BaseModel):
    """Lo que contó la IA en una foto. Es una estimación: el operario la corrige."""

    cantidad: int
    confianza: float
    advertencias: list[str]
