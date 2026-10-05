"""
Schemas de cálculo de cotización — RF-06.

`ItemCalculoEntrada` y `ResultadoCalculoCotizacion` reflejan el contrato
de `POST /api/cotizacion/calcular` en calc-service: este servicio es
stateless, así que el backend valida la entrada y resuelve la salida
con los mismos nombres de campo, sin traducir nada de por medio.

`CotizacionCrear`/`CotizacionLeer` son del endpoint orquestador
(`POST /api/cotizacion`): arma el cálculo anterior y lo persiste.
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

    # Resultado de calc-service en el momento de crear la cotización. No
    # se persiste (ItemCotizacion solo guarda L/A/B): por ahora este
    # desglose solo viaja en la respuesta de creación. Reconstruirlo más
    # adelante (ej. un GET) tiene que resolver el precio vigente EN LA
    # FECHA de la cotización, no el actual — una proforma no puede
    # cambiar de total porque el precio de un material cambió después.
    calculo: ResultadoCalculoCotizacion
