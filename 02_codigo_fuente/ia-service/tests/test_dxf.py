"""Lectura directa de DXF (RF-04): bloques contados a mano."""

import pytest

import io
import math

import ezdxf

from app.services.dxf import DxfIlegible, interpretar_dxf, rectangulos_de_grupo
from tests.fabricas_dxf import crear_dxf

# Dos bloques 4 × 24 y uno 4 × 10, separados por pasillos de 5 m
PLANTA = [(0, 0, 4, 24), (15, 0, 4, 24), (30, 0, 4, 10)]


def tipos(resultado):
    return [(b.etiqueta, b.paneles_largo, b.paneles_ancho, b.repeticiones, b.orientacion) for b in resultado.bloques]


def test_cuenta_y_agrupa_los_bloques():
    r = interpretar_dxf(crear_dxf(PLANTA))
    assert r.metodo == "dxf"
    # El tipo más repetido es "A", como en los bocetos de HEXtructure
    assert tipos(r) == [("A", 4, 24, 2, "vertical"), ("B", 4, 10, 1, "vertical")]
    assert any("no tienen el tamaño de un panel" in a for a in r.advertencias)


@pytest.mark.parametrize("angulo", [30, 137.5])
def test_el_resultado_no_depende_de_la_rotacion_del_dibujo(angulo):
    """Girar todo el dibujo no cambia L, A ni B (cambia la orientación si pasa los 45°)."""
    r = interpretar_dxf(crear_dxf(PLANTA, angulo=angulo))
    assert [(b.paneles_largo, b.paneles_ancho, b.repeticiones) for b in r.bloques] == [(4, 24, 2), (4, 10, 1)]


def test_lado_mayor_vertical_da_orientacion_horizontal():
    r = interpretar_dxf(crear_dxf(PLANTA, angulo=90))
    assert {b.orientacion for b in r.bloques} == {"horizontal"}


def test_paneles_como_bloques_insertados():
    r = interpretar_dxf(crear_dxf(PLANTA, con_insert=True))
    assert tipos(r) == [("A", 4, 24, 2, "vertical"), ("B", 4, 10, 1, "vertical")]


def test_bloque_escalonado_se_parte_en_rectangulos():
    """Al último bloque (4 × 10) le faltan 3 paneles de una columna: queda 3 × 10 + 1 × 7, sin perder paneles."""
    r = interpretar_dxf(crear_dxf(PLANTA, quitar=3))
    assert [(b.paneles_largo, b.paneles_ancho, b.repeticiones) for b in r.bloques] == [(4, 24, 2), (3, 10, 1), (1, 7, 1)]
    assert any("1 bloque(s) escalonados" in a and "2 bloques rectangulares" in a for a in r.advertencias)


def test_l_impar_se_advierte():
    r = interpretar_dxf(crear_dxf([(0, 0, 3, 10), (15, 0, 3, 10)]))
    assert tipos(r) == [("A", 3, 10, 2, "vertical")]
    assert any("L impar (3)" in a for a in r.advertencias)


def test_sin_paneles_es_ilegible():
    with pytest.raises(DxfIlegible, match="No se encontraron paneles"):
        interpretar_dxf(crear_dxf([], extras=False))


def test_archivo_roto_es_ilegible():
    with pytest.raises(DxfIlegible):
        interpretar_dxf(b"  0\nSECTION\n  2\nENTITIES\n esto no es un dxf")


def test_planta_grande_en_tiempo_razonable():
    """Una planta de ~3 000 paneles (como San Pablo) se procesa en menos de 3 segundos."""
    import time

    planta = [(x * 12, y * 30, 4, 24) for x in range(6) for y in range(5)]
    inicio = time.perf_counter()
    r = interpretar_dxf(crear_dxf(planta))
    assert time.perf_counter() - inicio < 3
    assert [(b.paneles_largo, b.paneles_ancho, b.repeticiones) for b in r.bloques] == [(4, 24, 30)]


# ─── Planos reales de HEXtructure (revisión del 25 de noviembre) ────────

LARGO_REAL, CORTO_REAL = 2.348, 1.303


def _dxf(paneles: list[tuple[float, float, float]], *, en_3d: bool = False) -> bytes:
    """Paneles (x, y, giro en grados) como rectángulos; en 3D, inclinados como en Incubandina."""
    doc = ezdxf.new("R2010")
    msp = doc.modelspace()
    for x, y, giro in paneles:
        t = math.radians(giro)
        esquinas = [(0, 0), (LARGO_REAL, 0), (LARGO_REAL, CORTO_REAL), (0, CORTO_REAL)]
        puntos = [(x + px * math.cos(t) - py * math.sin(t), y + px * math.sin(t) + py * math.cos(t)) for px, py in esquinas]
        if en_3d:
            alturas = [0.01, 0.34, 0.34, 0.01]
            msp.add_polyline3d([(px, py, z) for (px, py), z in zip(puntos, alturas)], close=True)
        else:
            msp.add_lwpolyline(puntos, close=True)
    flujo = io.StringIO()
    doc.write(flujo)
    return flujo.getvalue().encode("utf-8")


def _bloque(x0: float, y0: float, L: int, A: int, giro: float = 0.0, filas: dict[int, range] | None = None):
    """Paneles de un bloque L × A girado; `filas` limita las filas de algunas columnas (bloque escalonado)."""
    t = math.radians(giro)
    for i in range(L):
        for j in filas.get(i, range(A)) if filas else range(A):
            x, y = i * (LARGO_REAL + 0.06), j * (CORTO_REAL + 0.02)
            yield x0 + x * math.cos(t) - y * math.sin(t), y0 + x * math.sin(t) + y * math.cos(t), giro


def test_paneles_dibujados_en_3d_se_proyectan_al_plano():
    """Incubandina y Ecuahielos dibujan cada panel inclinado (polilínea 3D): antes se ignoraban y salían 0 paneles."""
    r = interpretar_dxf(_dxf(list(_bloque(0, 0, 10, 28)) + list(_bloque(40, 0, 10, 28)), en_3d=True))
    assert [(b.paneles_largo, b.paneles_ancho, b.repeticiones) for b in r.bloques] == [(10, 28, 2)]


def test_bloque_escalonado_como_en_incubandina():
    """Columnas de a dos con distinto largo, siguiendo las curvas de nivel: 2 × 12, 2 × 16 y 4 × 25."""
    filas = {0: range(13, 25), 1: range(13, 25), 2: range(9, 25), 3: range(9, 25)}
    r = interpretar_dxf(_dxf(list(_bloque(0, 0, 8, 25, filas=filas))))
    assert sorted((b.paneles_largo, b.paneles_ancho) for b in r.bloques) == [(2, 12), (2, 16), (4, 25)]
    assert sum(b.paneles_largo * b.paneles_ancho * b.repeticiones for b in r.bloques) == 2 * 12 + 2 * 16 + 4 * 25


def test_cada_bloque_se_cuenta_con_su_propio_giro():
    """Ecuahielos tiene bloques girados entre 63,8° y 65°: contarlos con un solo giro los partía en pedazos."""
    paneles = list(_bloque(0, 0, 18, 26, giro=64.0)) + list(_bloque(60, 0, 18, 26, giro=65.0))
    r = interpretar_dxf(_dxf(paneles))
    assert [(b.paneles_largo, b.paneles_ancho, b.repeticiones) for b in r.bloques] == [(18, 26, 2)]
    assert any("giros distintos (64.0° a 65.0°)" in a for a in r.advertencias)


def test_zonas_separadas_se_avisan_con_sus_paneles():
    paneles = list(_bloque(0, 0, 4, 12)) + list(_bloque(15, 0, 4, 12)) + list(_bloque(300, 0, 2, 6))
    r = interpretar_dxf(_dxf(paneles))
    assert any("2 zonas separadas" in a and "zona 1: 96 paneles, zona 2: 12 paneles" in a for a in r.advertencias)


def test_bloques_cercanos_son_una_sola_zona():
    r = interpretar_dxf(_dxf(list(_bloque(0, 0, 4, 12)) + list(_bloque(15, 0, 4, 12))))
    assert not any("zonas separadas" in a for a in r.advertencias)


@pytest.mark.parametrize(
    "posiciones, esperado",
    [
        ([(x, y) for x in range(3) for y in range(4)], [(3, 4)]),
        # Una columna más corta al final
        ([(x, y) for x in range(2) for y in range(4)] + [(2, 0), (2, 1)], [(2, 4), (1, 2)]),
        # Un hueco en medio de una columna la parte en dos tramos
        ([(0, 0), (0, 1), (0, 3), (0, 4)], [(1, 2), (1, 2)]),
    ],
)
def test_rectangulos_de_grupo(posiciones, esperado):
    assert sorted(rectangulos_de_grupo([(x * 2.4, y * 1.3) for x, y in posiciones], 2.348, 1.303)) == sorted(esperado)


def test_panel_repetido_en_la_misma_posicion_se_cuenta_una_vez_y_se_avisa():
    """Revisión del #108: un panel copiado encima de otro no debe sumar ni pasar en silencio."""
    paneles = list(_bloque(0, 0, 4, 12))
    r = interpretar_dxf(_dxf(paneles + paneles[:3]))
    assert [(b.paneles_largo, b.paneles_ancho, b.repeticiones) for b in r.bloques] == [(4, 12, 1)]
    assert any("3 paneles repetidos en la misma posición" in a for a in r.advertencias)
    assert not any("no tienen el tamaño de un panel" in a for a in r.advertencias)
