"""
Schemas de cálculo de cotización — RF-06.

`ItemCalculoEntrada` y `ResultadoCalculoCotizacion` reflejan el contrato
de `POST /api/cotizacion/calcular` en calc-service: este servicio es
stateless, así que el backend valida la entrada y resuelve la salida
con los mismos nombres de campo, sin traducir nada de por medio.

`CotizacionCrear`/`CotizacionLeer` son del endpoint orquestador
(`POST /api/cotizaciones`): arma el cálculo anterior y lo persiste.

`CotizacionResumenLeer`/`CotizacionDetalleLeer`/`CotizacionesPaginaLeer`
son del historial (RF-10): leen lo que quedó persistido, no el resultado
de calc-service. Por eso `CotizacionDetalleLeer` no tiene la cantidad de
cada material POR ÍTEM (`ResultadoCalculoCotizacion.items[].cantidades`):
esa nunca se guardó, solo el total por material de toda la cotización
(ver `MaterialCotizado` en models/cotizacion.py).
"""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.models.cotizacion import EstadoCotizacion


class ItemCalculoEntrada(BaseModel):
    """Un bloque de estructura: L (paneles en el largo, par), A (paneles en el ancho), B (bloques)."""

    paneles_largo: int = Field(gt=0, description="L: paneles en el largo (número par)")
    paneles_ancho: int = Field(gt=0, description="A: paneles en el ancho")
    bloques: int = Field(gt=0, description="B: número de bloques iguales")

    @field_validator("paneles_largo")
    @classmethod
    def validar_largo_par(cls, valor: int) -> int:
        # Misma regla que ItemEntrada en calc-service: se valida acá
        # para devolver 422 en vez de un 502 por un rechazo corriente.
        if valor % 2 != 0:
            raise ValueError("paneles_largo (L) debe ser un número par")
        return valor


class ItemCalculado(BaseModel):
    paneles_largo: int
    paneles_ancho: int
    bloques: int
    cantidades: dict[str, int]


class ResultadoCalculoCotizacion(BaseModel):
    items: list[ItemCalculado]
    cantidades_totales: dict[str, int]

    subtotal: Decimal

    addendum_porcentaje: Decimal
    addendum_monto: Decimal

    iva_porcentaje: Decimal
    iva_monto: Decimal

    total: Decimal


class TramoPago(BaseModel):
    """Un tramo de la forma de pago (ej. "Anticipo", 40%)."""

    nombre: str = Field(min_length=1, max_length=100)
    porcentaje: Decimal = Field(gt=0, le=100)


class CondicionesProforma(BaseModel):
    """
    Condiciones comerciales de la proforma, editables por cotización
    (antes fijas en `settings` para todas: acuerdo de la reunión con
    Santi, SQ-213). Lo que no se manda usa el valor de `settings` como
    antes — ver `services/cotizacion.py`.

    El precio por Wp no está acá: se calcula solo (subtotal ÷ potencia
    en Wp), no se edita — es el número que el cliente compara contra el
    precio de referencia del mercado.
    """

    plazo_dias: int | None = Field(default=None, ge=1)
    validez_dias: int | None = Field(default=None, ge=1)
    garantia_anios: int | None = Field(default=None, ge=1)
    pagos: list[TramoPago] | None = Field(
        default=None,
        min_length=1,
        description=(
            "Tramos de la forma de pago (nombre y porcentaje), deben sumar 100. Las proformas reales "
            "varían: CT519 es Anticipo 40 / Entrega 60; CT521A es Anticipo 30 / tres entregas de 25/25/20."
        ),
    )

    @field_validator("pagos")
    @classmethod
    def validar_forma_de_pago(cls, pagos: list["TramoPago"] | None) -> list["TramoPago"] | None:
        if pagos is not None:
            suma = sum((tramo.porcentaje for tramo in pagos), start=Decimal("0"))
            if suma != 100:
                partes = " + ".join(f"{t.nombre} {t.porcentaje}" for t in pagos)
                raise ValueError(f"Los porcentajes de la forma de pago deben sumar 100 ({partes} = {suma})")
        return pagos


class CotizacionCrear(BaseModel):
    # Nullable a propósito, igual que en el modelo: permite cotizar a un
    # cliente que todavía no está en el catálogo (RF-12). Si se manda
    # cliente_id, el snapshot (nombre, empresa, email, teléfono) se toma
    # del registro de Cliente y estos campos se ignoran — no tendría
    # sentido que el cliente #7 quede guardado con el nombre que alguien
    # tipeó en el formulario. Solo se usan cuando NO hay cliente_id.
    cliente_id: int | None = Field(default=None, gt=0)
    cliente_nombre: str | None = Field(default=None, min_length=1, max_length=150)
    cliente_empresa: str | None = Field(default=None, max_length=150)
    cliente_email: EmailStr | None = None
    cliente_telefono: str | None = Field(default=None, max_length=30)

    proyecto_id: int | None = Field(default=None, gt=0)
    proyecto_nombre: str | None = Field(default=None, max_length=150)

    addendum_porcentaje: Decimal = Field(default=Decimal("0"), ge=0, le=100)

    items: list[ItemCalculoEntrada] = Field(min_length=1)

    condiciones: CondicionesProforma | None = Field(
        default=None, description="Lo que no se manda usa el valor de settings, igual que antes"
    )

    @model_validator(mode="after")
    def validar_cliente(self) -> "CotizacionCrear":
        if self.cliente_id is None and not self.cliente_nombre:
            raise ValueError(
                "cliente_nombre es obligatorio si no se manda cliente_id "
                "(cotizar a un cliente que todavía no está en el catálogo)"
            )
        return self


class CotizacionLeer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    numero_proforma: str | None
    estado: EstadoCotizacion

    cliente_id: int | None
    cliente_nombre: str
    cliente_empresa: str | None
    cliente_email: str | None
    cliente_telefono: str | None

    proyecto_id: int | None
    proyecto_nombre: str | None

    addendum_porcentaje: Decimal

    created_at: datetime
    updated_at: datetime

    # Resultado de calc-service en el momento de crear la cotización.
    # Igual que subtotal/iva_monto/total, que ya quedaron persistidos en
    # la Cotización: esto es la misma información, con el detalle por
    # ítem y por material que no amerita columnas propias.
    calculo: ResultadoCalculoCotizacion


# ─── Historial (RF-10) ───────────────────────────────────────────────


class CotizacionResumenLeer(BaseModel):
    """Una fila del listado: lo necesario para identificarla y filtrar."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    numero_proforma: str | None
    estado: EstadoCotizacion
    cliente_nombre: str
    cliente_empresa: str | None
    proyecto_id: int | None
    proyecto_nombre: str | None
    total: Decimal | None
    created_at: datetime


class ItemCotizacionLeer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    paneles_largo: int
    paneles_ancho: int
    bloques: int


class MaterialCotizadoLeer(BaseModel):
    """Cantidad y precio del material TAL COMO SE EMITIÓ, no el catálogo actual."""

    material_id: int
    codigo: str
    nombre: str
    unidad: str
    cantidad: int
    precio_unitario: Decimal


class TramoPagoLeer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    nombre: str
    porcentaje: Decimal


class CotizacionDetalleLeer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    numero_proforma: str | None
    estado: EstadoCotizacion

    cliente_id: int | None
    cliente_nombre: str
    cliente_empresa: str | None
    cliente_email: str | None
    cliente_telefono: str | None

    proyecto_id: int | None
    proyecto_nombre: str | None

    addendum_porcentaje: Decimal
    subtotal: Decimal | None
    addendum_monto: Decimal | None
    iva_porcentaje: Decimal | None
    iva_monto: Decimal | None
    total: Decimal | None

    # Condiciones de la proforma, editables por cotización (SQ-213).
    # Nullable/vacío: las cotizaciones de antes de este campo no lo tienen.
    plazo_dias: int | None
    validez_dias: int | None
    garantia_anios: int | None
    pagos: list[TramoPagoLeer]
    precio_wp: Decimal | None

    created_at: datetime
    updated_at: datetime

    items: list[ItemCotizacionLeer]
    materiales: list[MaterialCotizadoLeer]


class CotizacionesPaginaLeer(BaseModel):
    resultados: list[CotizacionResumenLeer]
    total: int
    pagina: int
    por_pagina: int
    total_paginas: int
