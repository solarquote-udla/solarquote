"""
Schemas de Terreno y Camino (Pydantic) — RF-01.

La validación geométrica vive aquí y no en el modelo de base de datos
para que un polígono mal formado se rechace con un 422 y un mensaje
accionable, antes de tocar la sesión de SQLAlchemy.
"""

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.terreno import TipoCamino
from app.services.geometria import MIN_VERTICES, GeometriaInvalida, validar_poligono

# Un vértice es exactamente [x, y] en metros.
Vertice = Annotated[list[float], Field(min_length=2, max_length=2)]

# Límite superior de vértices. No hay razón técnica para un tope tan
# alto; existe para que un cliente defectuoso no envíe un polígono de
# cien mil puntos y tumbe el proceso.
MAX_VERTICES = 500


def _validar_poligono(vertices: list[list[float]], etiqueta: str) -> list[list[float]]:
    """Traduce los errores de Shapely a errores de validación de Pydantic."""
    try:
        validar_poligono(vertices, etiqueta)
    except GeometriaInvalida as error:
        raise ValueError(str(error)) from error
    return vertices


# ─── Camino ─────────────────────────────────────────────────────────


class CaminoBase(BaseModel):
    nombre: str | None = Field(
        default=None,
        max_length=100,
        description="Etiqueta para identificarlo en el plano, p. ej. 'Acceso norte'",
    )
    tipo: TipoCamino = TipoCamino.INTERNO
    vertices: list[Vertice] = Field(
        min_length=MIN_VERTICES,
        max_length=MAX_VERTICES,
        description="Polígono del camino, en metros, en orden de recorrido",
    )

    @field_validator("vertices")
    @classmethod
    def validar_geometria(cls, v: list[list[float]]) -> list[list[float]]:
        return _validar_poligono(v, "El camino")


class CaminoCrear(CaminoBase):
    pass


class CaminoLeer(CaminoBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    terreno_id: int
    created_at: datetime


# ─── Terreno ────────────────────────────────────────────────────────


class TerrenoBase(BaseModel):
    vertices: list[Vertice] = Field(
        min_length=MIN_VERTICES,
        max_length=MAX_VERTICES,
        description="Polígono del predio, en metros, relativo al origen local",
    )
    orientacion_norte: float | None = Field(
        default=None,
        ge=0,
        lt=360,
        description="Grados del norte respecto al eje Y positivo",
    )
    notas: str | None = Field(default=None, max_length=500)

    @field_validator("vertices")
    @classmethod
    def validar_geometria(cls, v: list[list[float]]) -> list[list[float]]:
        return _validar_poligono(v, "El terreno")


class TerrenoCrear(TerrenoBase):
    """
    Alta del terreno de un proyecto.

    Los caminos pueden venir en el mismo envío. Es lo natural: el
    usuario dibuja el predio y sus caminos en una sola pantalla, y
    espera guardar una vez.
    """

    caminos: list[CaminoCrear] = Field(default_factory=list, max_length=50)


class TerrenoActualizar(BaseModel):
    """
    Modificación parcial. Todo opcional: la pantalla permite corregir
    solo la orientación sin reenviar el polígono completo.

    Los caminos se gestionan por sus propios endpoints, no aquí, para
    no obligar a reenviar la lista entera al mover uno solo.
    """

    vertices: list[Vertice] | None = Field(
        default=None,
        min_length=MIN_VERTICES,
        max_length=MAX_VERTICES,
    )
    orientacion_norte: float | None = Field(default=None, ge=0, lt=360)
    notas: str | None = Field(default=None, max_length=500)

    @field_validator("vertices")
    @classmethod
    def validar_geometria(cls, v: list[list[float]] | None) -> list[list[float]] | None:
        if v is None:
            return v
        return _validar_poligono(v, "El terreno")


class AreasTerreno(BaseModel):
    """
    Superficies calculadas, en metros cuadrados.

    No se guardan en la base: se derivan de la geometría en cada
    lectura. Persistirlas obligaría a recalcularlas en cada cambio de
    un camino y abriría la puerta a que queden desincronizadas.
    """

    area_bruta: float = Field(description="Superficie total del predio")
    area_caminos: float = Field(
        description="Superficie ocupada por caminos, sin contar dos veces los cruces"
    )
    area_util: float = Field(description="Superficie disponible para estructuras")


class TerrenoLeer(TerrenoBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    proyecto_id: int
    caminos: list[CaminoLeer]
    areas: AreasTerreno
    created_at: datetime
    updated_at: datetime
