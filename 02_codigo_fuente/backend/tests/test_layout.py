"""
Pruebas del algoritmo de layout — RF-03.

Todos los casos usan el panel de 2278 × 1134 mm (Jinko JKM580N), con el
que se verificó a mano:

    L = 4  →  largo = 4 × 2,278 = 9,112 m
    A ideal = round(3 × 9,112 / 1,134) = round(24,1) = 24
    ancho = 24 × 1,134 = 27,216 m        proporción = 2,987

Con montaje a 0° el largo en planta es el nominal, y los óptimos de los
terrenos rectangulares se pueden contar a mano.
"""

import itertools
import math

import pytest
from shapely.geometry import Polygon

from app.services.calculo_layout import (
    InversorLayout,
    LayoutImposible,
    PanelLayout,
    ParametrosLayout,
    cumple_proporcion,
    generar_layout,
    paneles_ancho_ideal,
    proporcion_bloque,
)

PANEL_PLANO = PanelLayout(largo_mm=2278, ancho_mm=1134, potencia_wp=580, angulo_montaje=0)
PANEL_INCLINADO = PanelLayout(largo_mm=2278, ancho_mm=1134, potencia_wp=580, angulo_montaje=7.5)

LARGO = 9.112   # 4 × 2,278
ANCHO = 27.216  # 24 × 1,134
PASILLO = 2.0


def rectangulo(ancho: float, alto: float, x: float = 0, y: float = 0) -> list[list[float]]:
    return [[x, y], [x + ancho, y], [x + ancho, y + alto], [x, y + alto]]


# ─── Bloque ideal y proporción ──────────────────────────────────────


def test_a_ideal_para_l4():
    assert paneles_ancho_ideal(4, 2.278, 1.134) == 24


def test_proporcion_del_bloque_ideal():
    assert proporcion_bloque(4, 24, 2.278, 1.134) == pytest.approx(2.987, abs=1e-3)


def test_bloque_real_de_emihana_pasa_con_20_por_ciento():
    """L=4, A=28 de la cotización real: proporción ≈ 3,48."""
    prop = proporcion_bloque(4, 28, 2.278, 1.134)
    assert prop == pytest.approx(3.485, abs=1e-3)
    assert cumple_proporcion(prop, 0.20)
    assert not cumple_proporcion(prop, 0.10)


# ─── Óptimos contados a mano ────────────────────────────────────────


def test_encaje_exacto_sin_bloques_cortos():
    """
    3 columnas y 2 filas de bloques con pasillos de 2 m, sin sobrante:
        ancho  = 3 × 9,112 + 2 × 2 = 31,336 m
        alto   = 2 × 27,216 + 2   = 56,432 m
    → 6 bloques de 4 × 24 = 576 paneles, todos en proporción.
    """
    r = generar_layout(
        rectangulo(31.336, 56.432), [], PANEL_PLANO, ParametrosLayout(), orientacion_norte=0
    )
    assert r.total_paneles == 576
    assert len(r.tipos) == 1
    t = r.tipos[0]
    assert (t.tipo, t.paneles_largo, t.paneles_ancho, t.repeticiones) == ("A", 4, 24, 6)
    assert t.en_proporcion


def test_rectangulo_100_por_60():
    """
    Columnas: floor((100 + 2) / 11,112) = 9.
    Por columna: 2 bloques completos ocupan 56,432 m; sobran 3,568 m,
    menos el pasillo quedan 1,568 m → 1 panel más (bloque 4 × 1).
    Total: 9 × (2 × 96 + 4) = 1764 paneles.
    """
    r = generar_layout(rectangulo(100, 60), [], PANEL_PLANO, ParametrosLayout(), orientacion_norte=0)
    assert r.total_paneles == 1764
    tipos = {(t.paneles_ancho, t.repeticiones, t.en_proporcion) for t in r.tipos}
    assert tipos == {(24, 18, True), (1, 9, False)}
    assert r.tipos[0].tipo == "A"  # el más repetido


def test_cumple_rnf01_frente_al_optimo_teorico():
    """
    RNF-01: variación ≤ 5 % respecto al óptimo calculado manualmente.
    Para el rectángulo de 100 × 60 el óptimo contado es 1764.
    """
    r = generar_layout(rectangulo(100, 60), [], PANEL_PLANO, ParametrosLayout(), orientacion_norte=0)
    assert r.total_paneles >= 0.95 * 1764


def test_rotar_terreno_y_norte_da_el_mismo_resultado():
    """
    Un terreno de 60 × 100 con el norte apuntando a +X (90°) es el mismo
    terreno de 100 × 60 con el norte hacia arriba.
    """
    r = generar_layout(rectangulo(60, 100), [], PANEL_PLANO, ParametrosLayout(), orientacion_norte=90)
    assert r.total_paneles == 1764


# ─── Reglas geométricas ─────────────────────────────────────────────


def _validar_bloques(r, terreno, caminos, separacion_minima):
    poligono = Polygon(terreno).buffer(1e-3)
    obstaculos = [Polygon(c) for c in caminos]
    bloques = [Polygon(b.vertices) for b in r.bloques]

    for b in bloques:
        assert poligono.contains(b), "bloque fuera del terreno"
        for c in obstaculos:
            assert b.intersection(c).area < 1e-6, "bloque sobre un camino"

    for a, b in itertools.combinations(bloques, 2):
        assert a.distance(b) >= separacion_minima - 1e-3, "bloques sin pasillo"


def test_terreno_irregular_con_caminos_cruzados():
    terreno = [[0, 0], [180, 0], [160, 120], [20, 150]]
    caminos = [
        rectangulo(200, 5, x=-10, y=60),  # este-oeste, sale del predio
        rectangulo(6, 200, x=80, y=-10),  # norte-sur, se cruza con el otro
    ]
    r = generar_layout(
        terreno, caminos, PANEL_INCLINADO, ParametrosLayout(), orientacion_norte=15, latitud=0.35
    )
    assert r.total_paneles > 0
    _validar_bloques(r, terreno, caminos, PASILLO)


def test_pasillo_configurable_se_respeta():
    terreno = rectangulo(120, 90)
    r = generar_layout(terreno, [], PANEL_PLANO, ParametrosLayout(pasillo_m=4), orientacion_norte=0)
    _validar_bloques(r, terreno, [], 4)
    assert r.separacion_norte_sur_m == 4


def test_la_sombra_reemplaza_al_pasillo_si_es_mayor():
    """
    Con 30° y latitud 0,35: sol mínimo a 66,21°.
    sombra = 9,112 × sen 30° / tan 66,21° = 4,556 / 2,269 ≈ 2,008 m.
    """
    r = generar_layout(
        rectangulo(100, 60),
        [],
        PanelLayout(2278, 1134, 580, 30),
        ParametrosLayout(pasillo_m=0.5),
        orientacion_norte=0,
        latitud=0.35,
    )
    assert r.separacion_este_oeste_m == pytest.approx(2.008, abs=1e-3)
    assert r.separacion_norte_sur_m == 0.5
    assert any("sombra" in a for a in r.advertencias)


def test_inclinacion_reduce_el_largo_en_planta():
    r = generar_layout(rectangulo(100, 60), [], PANEL_INCLINADO, ParametrosLayout(), orientacion_norte=0)
    assert r.largo_bloque_m == pytest.approx(LARGO * math.cos(math.radians(7.5)), abs=1e-3)


# ─── Advertencias y errores ─────────────────────────────────────────


def test_advierte_sin_orientacion_ni_latitud():
    r = generar_layout(rectangulo(100, 60), [], PANEL_PLANO, ParametrosLayout())
    texto = " ".join(r.advertencias)
    assert "orientación del norte" in texto
    assert "latitud" in texto


def test_terreno_demasiado_chico():
    with pytest.raises(LayoutImposible, match="No entra ningún bloque"):
        generar_layout(rectangulo(5, 5), [], PANEL_PLANO, ParametrosLayout(), orientacion_norte=0)


def test_camino_que_cubre_todo_el_terreno():
    with pytest.raises(LayoutImposible):
        generar_layout(
            rectangulo(50, 50), [rectangulo(60, 60, -5, -5)], PANEL_PLANO, ParametrosLayout()
        )


@pytest.mark.parametrize("l", [0, 3, 5])
def test_l_impar_o_cero_se_rechaza(l):
    with pytest.raises(LayoutImposible, match="par"):
        generar_layout(rectangulo(100, 60), [], PANEL_PLANO, ParametrosLayout(paneles_largo=l))


# ─── Capacidad deseada ──────────────────────────────────────────────


def test_capacidad_que_cabe_recorta_el_layout():
    """
    300 kWp / 580 Wp = 517,2 → 518 paneles. Se recorta a bloques de L=4:
    el último se acorta a ceil(resto / 4) filas, así que se instalan
    entre 518 y 521 paneles.
    """
    r = generar_layout(
        rectangulo(100, 60),
        [],
        PANEL_PLANO,
        ParametrosLayout(capacidad_deseada_kwp=300),
        orientacion_norte=0,
    )
    c = r.capacidad
    assert c.cabe
    assert c.paneles_necesarios == 518
    assert 518 <= r.total_paneles < 518 + 4
    assert c.maxima_kwp == pytest.approx(1764 * 0.58, abs=0.01)
    assert c.instalada_kwp == pytest.approx(r.total_paneles * 0.58, abs=0.01)
    assert c.remanente_kwp == pytest.approx(c.maxima_kwp - c.instalada_kwp, abs=0.01)


def test_capacidad_que_no_cabe_devuelve_la_maxima():
    r = generar_layout(
        rectangulo(100, 60),
        [],
        PANEL_PLANO,
        ParametrosLayout(capacidad_deseada_kwp=5000),
        orientacion_norte=0,
    )
    assert not r.capacidad.cabe
    assert r.total_paneles == 1764  # no bloquea: entrega el máximo
    assert any("no cabe" in a for a in r.advertencias)


# ─── Configuración eléctrica ────────────────────────────────────────


def test_electrica_con_datos_completos():
    """
    1764 paneles; string máx floor(1100 / 52,31) = 21, mín ceil(200 / 43,35) = 5.
    Strings: 1764 / 21 = 84 exactos. Inversores: ceil(1764 / 400) = 5.
    Por MPPT: ceil(84 / (5 × 2)) = 9, admite 10 → compatible.
    """
    r = generar_layout(
        rectangulo(100, 60),
        [],
        PANEL_PLANO,
        ParametrosLayout(),
        orientacion_norte=0,
        inversor=InversorLayout(vmax_v=1100, vmin_v=200, mppts=2, strings_por_mppt=10),
        panel_voc=52.31,
        panel_vmp=43.35,
    )
    e = r.electrica
    assert (e.paneles_por_string_min, e.paneles_por_string_max) == (5, 21)
    assert (e.strings_totales, e.paneles_sin_string) == (84, 0)
    assert e.inversores == 5
    assert e.strings_por_mppt == 9
    assert e.compatible


def test_electrica_sugiere_mas_inversores():
    r = generar_layout(
        rectangulo(100, 60),
        [],
        PANEL_PLANO,
        ParametrosLayout(),
        orientacion_norte=0,
        inversor=InversorLayout(vmax_v=1100, vmin_v=200, mppts=2, strings_por_mppt=2),
        panel_voc=52.31,
        panel_vmp=43.35,
    )
    assert r.electrica.compatible is False
    # 84 strings / (2 MPPT × 2 strings) = 21 inversores
    assert "21 inversores" in r.electrica.motivo


def test_electrica_sin_voltajes_no_inventa_strings():
    r = generar_layout(rectangulo(100, 60), [], PANEL_PLANO, ParametrosLayout(), orientacion_norte=0)
    assert r.electrica.compatible is None
    assert r.electrica.strings_totales is None
    assert r.electrica.inversores == 5  # la regla de 400 sí aplica
