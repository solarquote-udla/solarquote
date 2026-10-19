"""Esquemas del boceto del cliente — RF-04 y RF-05."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Orientacion = Literal["vertical", "horizontal"]

# Límites de una edición: más de esto no es un boceto, es un error de captura
MAXIMO_TIPOS = 100
MAXIMO_PANELES_LARGO = 50
MAXIMO_PANELES_ANCHO = 500
MAXIMO_REPETICIONES = 10_000


class BloqueBocetoEditar(BaseModel):
    """Un tipo de bloque tal como lo deja el Gerente en la confirmación."""

    etiqueta: str | None = Field(default=None, max_length=20)
    paneles_largo: int = Field(ge=2, le=MAXIMO_PANELES_LARGO, description="L: par, la estructura apoya los paneles de a dos")
    paneles_ancho: int = Field(ge=1, le=MAXIMO_PANELES_ANCHO, description="A: paneles a lo largo de la fila")
    repeticiones: int = Field(ge=1, le=MAXIMO_REPETICIONES, description="B: bloques iguales")
    orientacion: Orientacion = "vertical"

    @field_validator("paneles_largo")
    @classmethod
    def _largo_par(cls, valor: int) -> int:
        if valor % 2:
            raise ValueError("L debe ser par: la estructura apoya los paneles de a dos.")
        return valor

    @field_validator("etiqueta")
    @classmethod
    def _etiqueta(cls, valor: str | None) -> str | None:
        return valor.strip() or None if valor is not None else None


class BocetoBloquesEditar(BaseModel):
    """Se envían todos los tipos que quedan: los que no vienen se eliminan."""

    bloques: list[BloqueBocetoEditar] = Field(min_length=1, max_length=MAXIMO_TIPOS)


class BloqueBocetoLeer(BaseModel):
    etiqueta: str | None
    paneles_largo: int
    paneles_ancho: int
    repeticiones: int
    orientacion: Orientacion
    confianza: float | None
    paneles: int = Field(description="L × A × B")
    proporcion: float = Field(description="Ancho / largo del bloque, con el panel de referencia")
    en_proporcion: bool


class PanelReferencia(BaseModel):
    """Panel con el que se mide la proporción y la potencia."""

    largo_mm: float
    ancho_mm: float
    potencia_wp: float | None
    origen: Literal["equipo", "referencia"] = Field(
        description="'equipo' si el proyecto tiene panel configurado (RF-02); si no, el de 2278 × 1134 mm"
    )


class BocetoLeer(BaseModel):
    proyecto_id: int
    nombre_archivo: str
    formato: Literal["pdf", "png", "jpg", "dxf"]
    tamano_bytes: int
    metodo: Literal["dxf", "ia"]
    advertencias: list[str]
    bloques: list[BloqueBocetoLeer]
    total_paneles: int
    potencia_kwp: float | None = Field(description="Solo si el proyecto tiene panel configurado")
    panel: PanelReferencia
    tolerancia_proporcion: float
    ediciones_manuales: int
    created_at: datetime
    updated_at: datetime
