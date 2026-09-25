"""
Registro central de modelos.

IMPORTANTE: todo modelo nuevo debe importarse aquí.
Alembic solo detecta las tablas de los modelos que estén en este archivo.

El orden de importación importa: los modelos compartidos (Cliente,
Proyecto) van primero porque Cotizacion los referencia.
"""

from app.models.cliente import Cliente, TipoIdentificacion
from app.models.proyecto import EstadoProyecto, Proyecto
from app.models.cotizacion import Cotizacion, EstadoCotizacion, ItemCotizacion
from app.models.material import Material, PrecioMaterial
from app.models.usuario import RolUsuario, Usuario

__all__ = [
    # Usuarios y seguridad
    "Usuario",
    "RolUsuario",
    # Modelos compartidos — ver docs/MODELOS-COMPARTIDOS.md
    "Cliente",
    "TipoIdentificacion",
    "Proyecto",
    "EstadoProyecto",
    # Cotización
    "Cotizacion",
    "ItemCotizacion",
    "EstadoCotizacion",
    # Materiales y precios
    "Material",
    "PrecioMaterial",
]
