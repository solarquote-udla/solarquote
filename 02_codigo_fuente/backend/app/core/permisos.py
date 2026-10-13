"""
Catálogo de permisos del sistema (RF-11 — Seguridad).

Cada permiso corresponde a una opción del menú del prototipo. Un perfil
tiene un conjunto de permisos y el menú solo muestra las opciones que su
perfil permite. El backend aplica la misma regla: un endpoint declara qué
permiso exige con `requiere_permiso(...)` y responde 403 si falta.

El Dashboard no es un permiso: todo usuario autenticado lo ve, con los
indicadores de los módulos a los que tiene acceso.

Los códigos se guardan como texto en `perfil_permisos.codigo`, no como
ENUM de Postgres, para poder agregar permisos sin una migración que
altere el tipo. La validación ocurre en la API contra este catálogo.
"""

from dataclasses import dataclass
from enum import Enum


class Permiso(str, Enum):
    # CÁLCULO
    GENERAR_LAYOUT = "generar_layout"
    CARGAR_BOCETO = "cargar_boceto"
    HISTORIAL = "historial"
    # OPERACIONES
    DESPACHO = "despacho"
    RECEPCION = "recepcion"
    CLIENTES = "clientes"
    # CONFIGURACIÓN
    INVERSORES = "inversores"
    MATERIALES = "materiales"
    PRECIOS = "precios"
    PERFILES = "perfiles"
    USUARIOS = "usuarios"


@dataclass(frozen=True)
class DefinicionPermiso:
    codigo: Permiso
    nombre: str
    grupo: str
    descripcion: str


CATALOGO: tuple[DefinicionPermiso, ...] = (
    DefinicionPermiso(Permiso.GENERAR_LAYOUT, "Generar layout solar", "CÁLCULO",
                      "Crear proyectos, definir terreno, equipo y layout, y cotizar"),
    DefinicionPermiso(Permiso.CARGAR_BOCETO, "Cargar boceto", "CÁLCULO",
                      "Interpretar un boceto o plano para generar el diseño"),
    DefinicionPermiso(Permiso.HISTORIAL, "Historial", "CÁLCULO",
                      "Consultar y retomar proyectos y cotizaciones"),
    DefinicionPermiso(Permiso.DESPACHO, "Despacho en planta", "OPERACIONES",
                      "Validar los materiales que salen de planta"),
    DefinicionPermiso(Permiso.RECEPCION, "Recepción en terreno", "OPERACIONES",
                      "Validar los materiales que llegan a obra"),
    DefinicionPermiso(Permiso.CLIENTES, "Clientes", "OPERACIONES",
                      "Registrar, editar y dar de baja clientes"),
    DefinicionPermiso(Permiso.INVERSORES, "Inversores", "CONFIGURACIÓN",
                      "Administrar el catálogo de inversores"),
    DefinicionPermiso(Permiso.MATERIALES, "Materiales", "CONFIGURACIÓN",
                      "Administrar el catálogo de materiales"),
    DefinicionPermiso(Permiso.PRECIOS, "Precios unitarios", "CONFIGURACIÓN",
                      "Actualizar los precios vigentes de los materiales"),
    DefinicionPermiso(Permiso.PERFILES, "Perfiles", "CONFIGURACIÓN",
                      "Crear perfiles y asignarles permisos"),
    DefinicionPermiso(Permiso.USUARIOS, "Usuarios", "CONFIGURACIÓN",
                      "Crear usuarios, asignarles perfil y restablecer contraseñas"),
)

TODOS_LOS_PERMISOS: frozenset[str] = frozenset(p.value for p in Permiso)

# Perfiles del sistema: se crean en la migración, no se pueden eliminar ni
# renombrar. La clave es estable; el nombre visible podría traducirse.
CLAVE_GERENTE_GENERAL = "gerente_general"
CLAVE_PERSONAL_PRODUCCION = "personal_produccion"

PERMISOS_INICIALES_PRODUCCION: tuple[Permiso, ...] = (Permiso.DESPACHO, Permiso.RECEPCION)
