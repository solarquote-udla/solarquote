"""
Contrato del servicio de IA — RF-04.

Un bloque usa la notación de HEXtructure: L paneles en el largo (la
dirección de la pendiente, el lado mayor del panel), A paneles en el ancho
(a lo largo de la fila) y B bloques iguales.
"""

from typing import Literal

from pydantic import BaseModel, Field

Formato = Literal["pdf", "png", "jpg", "dxf"]
Metodo = Literal["dxf", "ia"]
Orientacion = Literal["vertical", "horizontal"]


class BloqueDetectado(BaseModel):
    etiqueta: str | None = Field(default=None, max_length=40, description="Tipo o nombre del bloque en el boceto")
    paneles_largo: int = Field(ge=1, le=50, description="L: paneles en la dirección de la pendiente")
    paneles_ancho: int = Field(ge=1, le=500, description="A: paneles a lo largo de la fila")
    repeticiones: int = Field(ge=1, le=10_000, description="B: cuántos bloques iguales hay")
    orientacion: Orientacion = Field(description="vertical: las filas (A) corren de arriba a abajo en el plano")
    confianza: float | None = Field(default=None, ge=0, le=1, description="Solo en la lectura con IA")


class ResultadoInterpretacion(BaseModel):
    formato: Formato
    metodo: Metodo
    bloques: list[BloqueDetectado]
    advertencias: list[str] = Field(default_factory=list)
