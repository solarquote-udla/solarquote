"""
Schemas de Proyecto (Pydantic).

Gestión mínima para que el Módulo 1 tenga a qué asociar el terreno:
crear, listar, consultar y corregir los datos descriptivos. El archivo
de proyectos queda para cuando haya una necesidad concreta.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

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


class ProyectoActualizar(BaseModel):
    """
    Corrección parcial (PATCH): solo cambia lo que viene en el cuerpo.

    Enviar `null` en un campo opcional lo borra; omitirlo lo deja igual.

    Fuera a propósito:
      - `cliente_id`: cambiar el cliente de un proyecto que ya puede
        tener cotizaciones rompería el historial. Si el cliente estaba
        mal, se crea otro proyecto.
      - `estado`: lo avanza el sistema según el trabajo hecho (terreno,
        equipo, cotización), no se edita a mano.
    """

    nombre: str | None = Field(default=None, min_length=3, max_length=150)
    ubicacion: str | None = Field(default=None, max_length=255)
    latitud: float | None = Field(default=None, ge=-90, le=90)
    longitud: float | None = Field(default=None, ge=-180, le=180)
    notas: str | None = Field(default=None, max_length=500)

    @field_validator("nombre")
    @classmethod
    def nombre_no_nulo(cls, v: str | None) -> str:
        # Opcional en el sentido de "puede no venir", pero si viene no
        # puede ser null: el proyecto siempre tiene nombre.
        if v is None or not v.strip():
            raise ValueError("El nombre del proyecto no puede quedar vacío.")
        return v.strip()


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
