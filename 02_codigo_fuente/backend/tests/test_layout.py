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
from shapely.affinity import rotate
from shapely.geometry import Polygon

from app.services.calculo_layout import (
    InversorLayout,
    LayoutImposible,
    PanelLayout,
    ParametrosLayout,
    asignar_inversores,
    cumple_proporcion,
    electrica_inversor,
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


# Jinko JKM580N con un inversor de 1100 / 200 V:
# string máx floor(1100 / 52,31) = 21, mín ceil(200 / 43,35) = 5.
VOC, VMP = 52.31, 43.35
INVERSOR_2_MPPT = InversorLayout(vmax_v=1100, vmin_v=200, mppts=2, strings_por_mppt=10)


def test_electrica_inversor_con_datos_completos():
    """420 paneles = 20 strings de 21; 20 / 2 MPPT = 10 por MPPT, admite 10."""
    e = electrica_inversor(420, VOC, VMP, INVERSOR_2_MPPT)
    assert (e.paneles_por_string_min, e.paneles_por_string_max) == (5, 21)
    assert (e.paneles_por_string, e.strings, e.paneles_sin_string) == (21, 20, 0)
    assert e.strings_por_mppt == 10
    assert e.compatible is True
    assert e.motivo is None


def test_electrica_inversor_sobrecargado():
    """441 paneles = 21 strings → 11 por MPPT y admite 10: tope 2 × 10 × 21 = 420."""
    e = electrica_inversor(441, VOC, VMP, INVERSOR_2_MPPT)
    assert e.compatible is False
    assert e.strings_por_mppt == 11
    assert "admite hasta 420 paneles y tiene 441" in e.motivo


def test_electrica_inversor_informa_paneles_sin_string():
    e = electrica_inversor(30, VOC, VMP, INVERSOR_2_MPPT)
    assert (e.strings, e.paneles_sin_string) == (1, 9)


def test_electrica_inversor_sin_voltajes_no_inventa_strings():
    e = electrica_inversor(420, VOC, VMP, InversorLayout())
    assert e.compatible is None
    assert e.strings is None
    assert "Vmax y Vmin" in e.motivo


def test_electrica_inversor_sin_bloques():
    e = electrica_inversor(0, VOC, VMP, INVERSOR_2_MPPT)
    assert e.compatible is None
    assert "No tiene bloques" in e.motivo


def test_electrica_inversor_incompatible_con_el_panel():
    e = electrica_inversor(100, VOC, VMP, InversorLayout(vmax_v=40, vmin_v=10))
    assert e.compatible is False
    assert e.strings is None


# ─── Asignación de bloques a inversores ─────────────────────────────


def _planta_100x60():
    """27 bloques: 9 franjas de 2 bloques 4 × 24 y uno corto 4 × 1 arriba."""
    r = generar_layout(rectangulo(100, 60), [], PANEL_PLANO, ParametrosLayout(), orientacion_norte=0)
    return [(b.vertices, b.paneles) for b in r.bloques]


def _orden_oeste_a_este(bloques):
    return sorted(range(len(bloques)), key=lambda i: (round(bloques[i][0][3][0], 1), bloques[i][0][3][1]))


def test_un_inversor_se_lleva_todo():
    bloques = _planta_100x60()
    assert asignar_inversores(bloques, [250]) == [0] * len(bloques)


def test_dos_inversores_iguales_se_reparten_mitad_y_mitad():
    """
    1764 paneles, corte en 882. Cada franja suma 196: tras 4 franjas van
    784. En la quinta, el bloque de abajo (96) termina en 880 y su punto
    medio (832) cae antes del corte: Inversor 1. El siguiente ya no.
    """
    bloques = _planta_100x60()
    asignacion = asignar_inversores(bloques, [160, 160])
    paneles = [sum(p for (_, p), i in zip(bloques, asignacion) if i == k) for k in (0, 1)]
    assert paneles == [880, 884]


def test_cada_inversor_recibe_un_sector_seguido():
    """Recorriendo de oeste a este, el número de inversor nunca vuelve atrás."""
    bloques = _planta_100x60()
    asignacion = asignar_inversores(bloques, [100, 100, 100, 100])
    en_orden = [asignacion[i] for i in _orden_oeste_a_este(bloques)]
    assert en_orden == sorted(en_orden)
    assert set(en_orden) == {0, 1, 2, 3}


def test_el_reparto_sigue_la_potencia_de_cada_inversor():
    bloques = _planta_100x60()
    asignacion = asignar_inversores(bloques, [200, 100])
    grande = sum(p for (_, p), i in zip(bloques, asignacion) if i == 0)
    # Dos tercios de 1764 = 1176, con el margen de medio bloque (48)
    assert abs(grande - 1176) <= 48


def test_la_asignacion_usa_el_norte_del_layout():
    """
    El mismo layout girado 30° (norte a 30°) debe repartirse igual: el
    orden por franjas se toma en el marco con el norte hacia arriba.
    """
    bloques = _planta_100x60()
    # Norte a 30° en sentido horario: el terreno es el original girado −30°
    girados = [
        ([list(c) for c in rotate(Polygon(v), -30, origin=(0, 0)).exterior.coords[:4]], p)
        for v, p in bloques
    ]
    assert asignar_inversores(girados, [160, 160], 30) == asignar_inversores(bloques, [160, 160], 0)


def test_mas_inversores_que_bloques():
    bloques = _planta_100x60()[:2]
    asignacion = asignar_inversores(bloques, [100] * 5)
    assert len(asignacion) == 2
    assert all(0 <= i < 5 for i in asignacion)
    assert asignacion[0] != asignacion[1]


def test_sin_bloques():
    assert asignar_inversores([], [100, 100]) == []
