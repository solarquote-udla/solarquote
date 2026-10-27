"""
Generador del diagrama ER (01_documentacion/arquitectura/DIAGRAMA-ER.md).

No prueba el diagrama en sí — ese es el punto: nunca se escribe a mano.
Prueba que el generador lee el esquema real y no se equivoca en lo que
sí se puede verificar mecánicamente: cuántas tablas hay, que cada
columna PK/FK/UK se marca sin comillas (si Mermaid las recibe con
comillas, las trata como comentario y no dibuja la llave) y que la
cardinalidad de las relaciones sale de si la FK admite null y de si es
única, no de una lista escrita a mano.
"""

from app.core.database import Base
from scripts.generar_diagrama_er import _entidad, _es_unica_una_sola_columna, _relaciones

CANTIDAD_DE_TABLAS = 24


def test_el_esquema_tiene_las_24_tablas_conocidas() -> None:
    """
    Si este número cambia por un modelo nuevo, hay que regenerar el
    diagrama (y actualizar este número) — no dejarlo desactualizado
    como pasó con el que estaba escrito a mano.
    """
    assert len(Base.metadata.tables) == CANTIDAD_DE_TABLAS


def test_las_llaves_van_sin_comillas_y_los_comentarios_con_comillas() -> None:
    """Con comillas, Mermaid no dibuja el ícono de PK/FK/UK: lo trata como texto."""
    entidad = _entidad(Base.metadata.tables["cotizaciones"])

    assert "int id PK" in entidad
    assert '"PK"' not in entidad
    assert "string numero_proforma UK " in entidad
    assert '"UK' not in entidad
    # El comentario (nullable, UK compuesta) sí va con comillas, aparte de la llave
    assert 'int cliente_id FK "nullable"' in entidad


def test_relacion_uno_a_muchos_con_fk_obligatoria() -> None:
    """Cliente.id ← Proyecto.cliente_id, no nulo, no único: un cliente, muchos proyectos."""
    relaciones = _relaciones(Base.metadata.tables)
    assert "    CLIENTES ||--o{ PROYECTOS : cliente" in relaciones


def test_relacion_uno_a_muchos_con_fk_opcional() -> None:
    """Cotizacion.cliente_id es nullable: cotizar al vuelo, sin cliente del catálogo."""
    relaciones = _relaciones(Base.metadata.tables)
    assert "    CLIENTES o|--o{ COTIZACIONES : cliente" in relaciones


def test_relacion_uno_a_uno_por_fk_unica() -> None:
    """Terreno.proyecto_id es FK única: a lo sumo un terreno por proyecto."""
    relaciones = _relaciones(Base.metadata.tables)
    assert "    PROYECTOS ||--o| TERRENOS : proyecto" in relaciones


def test_dos_fk_a_la_misma_tabla_se_distinguen_por_columna() -> None:
    """Cotizacion.usuario_id (quien cotiza) y .instalada_por_id (quien instaló) no son la misma relación."""
    relaciones = _relaciones(Base.metadata.tables)
    assert "    USUARIOS ||--o{ COTIZACIONES : usuario" in relaciones
    assert "    USUARIOS o|--o{ COTIZACIONES : instalada por" in relaciones


def test_uk_compuesta_no_marca_cada_columna_como_unica_por_si_sola() -> None:
    """despacho_id y material_id son únicos juntos en items_despacho, no cada uno por separado."""
    tabla = Base.metadata.tables["items_despacho"]
    assert not _es_unica_una_sola_columna(tabla.columns["despacho_id"])
    assert not _es_unica_una_sola_columna(tabla.columns["material_id"])
