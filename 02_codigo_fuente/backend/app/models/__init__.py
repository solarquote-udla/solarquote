"""
Registro central de modelos.

IMPORTANTE: todo modelo nuevo debe importarse aquí.
Alembic solo detecta las tablas de los modelos que estén en este archivo.

El orden de importación importa: los modelos compartidos (Cliente,
Proyecto) van primero porque Cotizacion los referencia.
"""

from app.models.cliente import Cliente, TipoIdentificacion
from app.models.proyecto import EstadoProyecto, Proyecto
from app.models.cotizacion import Cotizacion, EstadoCotizacion, ItemCotizacion, MaterialCotizado
from app.models.material import Material, PrecioMaterial
from app.models.inversor import Inversor
from app.models.equipo import ConfiguracionEquipo, InversorEquipo
from app.models.layout import BloqueLayout, Layout
from app.models.terreno import Camino, Terreno, TipoCamino
from app.models.perfil import Perfil, PerfilPermiso
from app.models.usuario import Usuario

__all__ = [
    # Usuarios y seguridad
    "Usuario",
    "Perfil",
    "PerfilPermiso",
    # Modelos compartidos — ver docs/MODELOS-COMPARTIDOS.md
    "Cliente",
    "TipoIdentificacion",
    "Proyecto",
    "EstadoProyecto",
    # Módulo 1 — Layout solar
    "Terreno",
    "Camino",
    "TipoCamino",
    "ConfiguracionEquipo",
    "InversorEquipo",
    "Layout",
    "BloqueLayout",
    # Cotización
    "Cotizacion",
    "ItemCotizacion",
    "MaterialCotizado",
    "EstadoCotizacion",
    # Materiales y precios
    "Material",
    "PrecioMaterial",
    # Inversores
    "Inversor",
]
