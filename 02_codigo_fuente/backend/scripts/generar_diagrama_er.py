"""
Genera el bloque `erDiagram` de Mermaid a partir de los modelos reales,
para pegarlo en 01_documentacion/arquitectura/DIAGRAMA-ER.md.

El diagrama se escribía a mano y se desactualizaba cada vez que se
agregaba una tabla (llegó a decir 17 cuando ya había 24). Esto lo
resuelve de raíz: lee `Base.metadata` — lo mismo que usa Alembic para
detectar cambios — así que nunca puede faltar ni sobrar una tabla.

Lo que se genera automáticamente: columnas, tipos, PK/FK/UK, si la
columna acepta null, y las relaciones (incluida la cardinalidad: "||"
exactamente una fila, "o|" cero o una, "o{" cero o muchas — deducida de
si la columna FK es nullable y de si está en una restricción UNIQUE).
Lo que NO se genera, porque no está en el esquema, y queda a mano en el
resto de DIAGRAMA-ER.md: las notas de por qué una relación no es FK
real, los patrones de diseño y cualquier aclaración de negocio.

Uso (desde la carpeta backend/, con el venv activado):
    python -m scripts.generar_diagrama_er > /tmp/diagrama.mmd

Y se pega el contenido reemplazando el bloque ```mermaid ... ``` de
DIAGRAMA-ER.md.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app.models  # noqa: E402,F401 — registra las tablas en Base.metadata
from app.core.database import Base  # noqa: E402
from sqlalchemy import Table, UniqueConstraint  # noqa: E402

TIPOS = {
    "INTEGER": "int",
    "VARCHAR": "string",
    "TEXT": "string",
    "BOOLEAN": "boolean",
    "DATETIME": "datetime",
    "NUMERIC": "decimal",
    "FLOAT": "float",
    "JSONB": "jsonb",
    "JSON": "json",
    "LARGEBINARY": "bytes",
    "ENUM": "string",
}


def _tipo(columna) -> str:
    nombre = type(columna.type).__name__.upper()
    return TIPOS.get(nombre, nombre.lower())


def _columnas_de_uk_compuesta(tabla: Table) -> dict[str, str]:
    """Columna → aviso corto, para las UNIQUE que abarcan más de una columna."""
    avisos: dict[str, str] = {}
    for restriccion in tabla.constraints:
        if isinstance(restriccion, UniqueConstraint) and len(restriccion.columns) > 1:
            nombres = ", ".join(c.name for c in restriccion.columns)
            for columna in restriccion.columns:
                avisos[columna.name] = f"UK con ({nombres})"
    return avisos


def _es_unica_una_sola_columna(columna) -> bool:
    if columna.unique:
        return True
    tabla = columna.table
    for restriccion in tabla.constraints:
        if isinstance(restriccion, UniqueConstraint) and list(restriccion.columns) == [columna]:
            return True
    return False


def _entidad(tabla: Table) -> str:
    avisos_compuestos = _columnas_de_uk_compuesta(tabla)
    lineas = [f"    {tabla.name.upper()} {{"]
    for columna in tabla.columns:
        marcas = []
        # Mermaid distingue las palabras clave (PK, FK, UK — sin comillas,
        # dibuja el ícono de llave) del comentario (con comillas, solo
        # texto). Si se meten las claves dentro de las comillas, Mermaid
        # las trata como comentario y no dibuja nada.
        if columna.primary_key:
            marcas.append("PK")
        if columna.foreign_keys:
            marcas.append("FK")
        if _es_unica_una_sola_columna(columna):
            marcas.append("UK")

        comentarios = []
        if columna.name in avisos_compuestos:
            comentarios.append(avisos_compuestos[columna.name])
        if columna.nullable and not columna.primary_key:
            comentarios.append("nullable")

        claves = f" {', '.join(marcas)}" if marcas else ""
        comentario = f' "{"; ".join(comentarios)}"' if comentarios else ""
        lineas.append(f"        {_tipo(columna)} {columna.name}{claves}{comentario}")
    lineas.append("    }")
    return "\n".join(lineas)


def _etiqueta(columna) -> str:
    """Nombre de la FK sin el "_id", para distinguir dos FK a la misma tabla (p. ej. Cotizacion.usuario_id vs instalada_por_id)."""
    base = columna.name[:-3] if columna.name.endswith("_id") else columna.name
    return base.replace("_", " ")


def _relaciones(tablas: dict[str, Table]) -> list[str]:
    lineas = []
    for tabla in tablas.values():
        for fk in tabla.foreign_keys:
            columna = fk.parent
            padre = fk.column.table
            # izquierda (junto al padre): exactamente una, o cero-o-una si la FK admite null
            izquierda = "o|" if columna.nullable else "||"
            # derecha (junto al hijo): cero-o-una si la FK es única (1 a 1), si no, cero-o-muchas
            derecha = "o|" if _es_unica_una_sola_columna(columna) else "o{"
            etiqueta = _etiqueta(columna)
            lineas.append(f"    {padre.name.upper()} {izquierda}--{derecha} {tabla.name.upper()} : {etiqueta}")
    return lineas


def main() -> int:
    tablas = Base.metadata.tables
    print("erDiagram")
    for nombre in sorted(tablas):
        print(_entidad(tablas[nombre]))
        print()
    for linea in sorted(_relaciones(tablas)):
        print(linea)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
