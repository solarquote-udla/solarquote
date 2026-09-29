"""
Schemas de Proyecto (Pydantic).

Gestión mínima para que el Módulo 1 tenga a qué asociar el terreno:
crear, listar y consultar. La edición y el archivo de proyectos quedan
para cuando haya una necesidad concreta.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.proyecto import EstadoProyecto


class ClienteResumen(BaseModel):
    """
    Lo mínimo del cliente para mostrar junto al proyecto.

    Se incrusta en la respuesta para que el listado no obligue al
    frontend a hacer una petición por cada fila.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    identificacion: str


class ProyectoCrear(BaseModel):
    nombre: str = Field(min_length=3, max_length=150)
    cliente_id: int = Field(gt=0)
    ubicacion: str | None = Field(
        default=None,
        max_length=255,
        description="Provincia, cantón y una referencia del sitio",
    )
    # Coordenadas en grados decimales. Float en la API aunque la columna
    # sea Numeric: el frontend trabaja con números, no con strings.
    latitud: float | None = Field(default=None, ge=-90, le=90)
    longitud: float | None = Field(default=None, ge=-180, le=180)
    notas: str | None = Field(default=None, max_length=500)


class ProyectoLeer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    cliente: ClienteResumen
    ubicacion: str | None
    latitud: float | None
    longitud: float | None
    estado: EstadoProyecto
    notas: str | None
    tiene_terreno: bool = Field(
        description="Si ya se definió el terreno (RF-01). Guía el siguiente paso en la interfaz.",
    )
    created_at: datetime
    updated_at: datetime
