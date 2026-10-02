"""Schemas de Cliente — RF-12. Ver CONTRATO-CLIENTES.md."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.models.cliente import TipoIdentificacion
from app.services.validaciones_identificacion import validar_identificacion, validar_telefono


def _vacio_a_none(valor: str | None) -> str | None:
    if valor is None:
        return None
    valor = valor.strip()
    return valor or None


def _validar_telefono_o_none(valor: str | None) -> str | None:
    valor = _vacio_a_none(valor)
    if valor is None:
        return None
    if not validar_telefono(valor):
        raise ValueError(f"'{valor}' no es un teléfono válido")
    return valor


class ClienteLeer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    tipo_identificacion: TipoIdentificacion
    identificacion: str
    empresa: str | None
    email: str | None
    telefono: str | None
    direccion: str | None
    activo: bool
    total_proyectos: int = Field(description="Calculado con un COUNT, no es una columna")
    created_at: datetime
    updated_at: datetime


class ClienteCrear(BaseModel):
    nombre: str = Field(min_length=3, max_length=150)
    tipo_identificacion: TipoIdentificacion
    identificacion: str = Field(min_length=1, max_length=20)
    empresa: str | None = Field(default=None, max_length=150)
    email: EmailStr | None = None
    telefono: str | None = Field(default=None, max_length=30)
    direccion: str | None = Field(default=None, max_length=255)

    @field_validator("nombre", mode="before")
    @classmethod
    def _trim_nombre(cls, valor: str) -> str:
        return valor.strip() if isinstance(valor, str) else valor

    @field_validator("empresa", "direccion", mode="before")
    @classmethod
    def _vacio_a_none_campo(cls, valor: str | None) -> str | None:
        return _vacio_a_none(valor)

    @field_validator("telefono")
    @classmethod
    def _telefono_valido(cls, valor: str | None) -> str | None:
        return _validar_telefono_o_none(valor)

    @model_validator(mode="after")
    def _identificacion_valida(self) -> "ClienteCrear":
        self.identificacion = validar_identificacion(self.tipo_identificacion, self.identificacion)
        return self


class ClienteActualizar(BaseModel):
    """
    Todos los campos opcionales: omitir uno lo deja igual, mandarlo en
    null lo borra (salvo los obligatorios — eso lo valida el servicio,
    porque acá no se sabe cuáles de estos campos vinieron realmente en
    el request vs. cuáles tomaron su default `None`).
    """

    nombre: str | None = Field(default=None, min_length=3, max_length=150)
    tipo_identificacion: TipoIdentificacion | None = None
    identificacion: str | None = Field(default=None, min_length=1, max_length=20)
    empresa: str | None = None
    email: EmailStr | None = None
    telefono: str | None = None
    direccion: str | None = None
    activo: bool | None = None

    @field_validator("nombre", mode="before")
    @classmethod
    def _trim_nombre(cls, valor: str | None) -> str | None:
        return valor.strip() if isinstance(valor, str) else valor

    @field_validator("empresa", "direccion", mode="before")
    @classmethod
    def _vacio_a_none_campo(cls, valor: str | None) -> str | None:
        return _vacio_a_none(valor)

    @field_validator("telefono")
    @classmethod
    def _telefono_valido(cls, valor: str | None) -> str | None:
        return _validar_telefono_o_none(valor)

    @model_validator(mode="after")
    def _identificacion_valida_si_vienen_ambos(self) -> "ClienteActualizar":
        # Si solo viene uno de los dos, el servicio la valida contra lo
        # que ya está guardado — acá no se tiene esa información.
        if self.identificacion is not None and self.tipo_identificacion is not None:
            self.identificacion = validar_identificacion(self.tipo_identificacion, self.identificacion)
        return self
