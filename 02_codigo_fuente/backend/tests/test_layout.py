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
    medida_fila,
    electrica_inversor,
    generar_layout,
    paneles_ancho_ideal,
    paneles_que_entran,
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


@pytest.mark.parametrize("l, a", [(2, 6), (4, 12), (8, 24)])
def test_bloque_compacto_es_a_igual_a_tres_l(l, a):
    """Ejemplos de HEXtructure (revisión del 17 de noviembre de 2026)."""
    assert paneles_ancho_ideal(l) == a
    assert proporcion_bloque(l, a) == 3
    assert cumple_proporcion(proporcion_bloque(l, a), 0.20)


@pytest.mark.parametrize("l, a", [(4, 28), (22, 28), (2, 30), (8, 13)])
def test_bloques_reales_de_clientes_no_son_compactos(l, a):
    """Los clientes eligen L y A por su inversor; el sistema solo avisa."""
    assert not cumple_proporcion(proporcion_bloque(l, a), 0.20)


def test_la_tolerancia_decide_el_borde():
    """4 × 14: A / L = 3,5, un 16,7 % sobre 3."""
    prop = proporcion_bloque(4, 14)
    assert cumple_proporcion(prop, 0.20)
    assert not cumple_proporcion(prop, 0.10)


def test_sin_a_se_usa_el_bloque_compacto():
    r = generar_layout(rectangulo(100, 60), [], PANEL_PLANO, ParametrosLayout(), orientacion_norte=0)
    assert r.paneles_ancho_ideal == 12
    assert r.bloque_compacto
    assert not any("no es compacto" in a for a in r.advertencias)


def test_a_manual_no_compacto_avisa_pero_genera():
    r = generar_layout(
        rectangulo(100, 60), [], PANEL_PLANO, ParametrosLayout(paneles_ancho=24), orientacion_norte=0
    )
    assert r.paneles_ancho_ideal == 24
    assert not r.bloque_compacto
    assert r.total_paneles > 0
    assert any("4 × 24 no es compacto" in a and "A = 3 × L = 12" in a for a in r.advertencias)


def test_separacion_entre_paneles_agranda_el_bloque():
    """
    Panel de 2278 × 1134 mm, L = 4, A = 12, con 6 cm a lo largo y 2 cm a lo ancho:
        largo = 4 × 2,278 + 3 × 0,06 = 9,292 m
        ancho = 12 × 1,134 + 11 × 0,02 = 13,828 m
    """
    r = generar_layout(
        rectangulo(100, 60),
        [],
        PANEL_PLANO,
        ParametrosLayout(paneles_ancho=12, separacion_largo_m=0.06, separacion_ancho_m=0.02),
        orientacion_norte=0,
    )
    assert r.largo_bloque_m == pytest.approx(9.292)
    assert r.ancho_bloque_m == pytest.approx(13.828)
    for b in r.bloques:
        xs = [v[0] for v in b.vertices]
        ys = [v[1] for v in b.vertices]
        assert max(xs) - min(xs) == pytest.approx(9.292, abs=1e-3)
        assert max(ys) - min(ys) == pytest.approx(medida_fila(b.paneles_ancho, 1.134, 0.02), abs=1e-3)


def test_bloque_corto_cuenta_la_separacion():
    """
    Una sola franja de 9,292 × 40 m, bloque de 12 (13,828 m) y pasillo de 2 m:
    dos completos llegan a 2 × 13,828 + 2 = 29,656 m; tras el pasillo
    sobran 40 − 31,656 = 8,344 m → (8,344 + 0,02) / 1,154 = 7,25 → 7 paneles.
    """
    r = generar_layout(
        rectangulo(9.292, 40),
        [],
        PANEL_PLANO,
        ParametrosLayout(paneles_ancho=12, separacion_largo_m=0.06, separacion_ancho_m=0.02),
        orientacion_norte=0,
    )
    assert sorted(b.paneles_ancho for b in r.bloques) == [7, 12, 12]


def test_medida_fila_y_paneles_que_entran_son_inversas():
    for n in range(1, 40):
        medida = medida_fila(n, 1.134, 0.02)
        assert paneles_que_entran(medida, 1.134, 0.02) == n
        assert paneles_que_entran(medida - 0.001, 1.134, 0.02) == n - 1


# ─── Óptimos contados a mano ────────────────────────────────────────


def test_encaje_exacto_sin_bloques_cortos():
    """
    3 columnas y 2 filas de bloques con pasillos de 2 m, sin sobrante:
        ancho  = 3 × 9,112 + 2 × 2 = 31,336 m
        alto   = 2 × 27,216 + 2   = 56,432 m
    → 6 bloques de 4 × 24 = 576 paneles, todos en proporción.
    """
    r = generar_layout(
        rectangulo(31.336, 56.432), [], PANEL_PLANO, ParametrosLayout(paneles_ancho=24), orientacion_norte=0
    )
    assert r.total_paneles == 576
    assert len(r.tipos) == 1
    t = r.tipos[0]
    assert (t.tipo, t.paneles_largo, t.paneles_ancho, t.repeticiones) == ("A", 4, 24, 6)
    # 4 × 24 no es compacto (A = 3 × L = 12): se genera igual y se avisa
    assert not t.en_proporcion


def test_rectangulo_100_por_60():
    """
    Columnas: floor((100 + 2) / 11,112) = 9.
    Por columna: 2 bloques completos ocupan 56,432 m; sobran 3,568 m,
    menos el pasillo quedan 1,568 m → 1 panel más (bloque 4 × 1).
    Total: 9 × (2 × 96 + 4) = 1764 paneles.
    """
    r = generar_layout(rectangulo(100, 60), [], PANEL_PLANO, ParametrosLayout(paneles_ancho=24), orientacion_norte=0)
    assert r.total_paneles == 1764
    tipos = {(t.paneles_ancho, t.repeticiones, t.en_proporcion) for t in r.tipos}
    assert tipos == {(24, 18, False), (1, 9, False)}
    assert r.tipos[0].tipo == "A"  # el más repetido


# ─── A mínimo de los bloques cortos (SQ-170) ────────────────────────


def test_a_minimo_descarta_los_bloques_de_una_fila():
    """
    Mismo terreno de 100 × 60 que arriba: sin mínimo quedan 9 bloques de
    4 × 1. Con A mínimo 2 no se generan y quedan solo los 18 completos.
    """
    r = generar_layout(
        rectangulo(100, 60), [], PANEL_PLANO, ParametrosLayout(paneles_ancho=24, paneles_ancho_minimo=2), orientacion_norte=0
    )
    assert r.total_paneles == 1764 - 9 * 4
    assert {(t.paneles_ancho, t.repeticiones) for t in r.tipos} == {(24, 18)}


def test_a_minimo_conserva_los_bloques_cortos_que_lo_alcanzan():
    """
    60 × 40: 5 columnas; en cada una un bloque de 24 y, con lo que sobra
    (40 − 27,216 − 2 = 10,784 m), uno de floor(10,784 / 1,134) = 9.
    Con A mínimo 9 se quedan; con 10 ya no.
    """
    params = dict(orientacion_norte=0)
    con_9 = generar_layout(rectangulo(60, 40), [], PANEL_PLANO, ParametrosLayout(paneles_ancho=24, paneles_ancho_minimo=9), **params)
    con_10 = generar_layout(rectangulo(60, 40), [], PANEL_PLANO, ParametrosLayout(paneles_ancho=24, paneles_ancho_minimo=10), **params)
    sin_minimo = generar_layout(rectangulo(60, 40), [], PANEL_PLANO, ParametrosLayout(paneles_ancho=24), **params)

    assert {(t.paneles_ancho, t.repeticiones) for t in con_9.tipos} == {(24, 5), (9, 5)}
    assert con_9.total_paneles == sin_minimo.total_paneles == 5 * 4 * (24 + 9)
    assert {(t.paneles_ancho, t.repeticiones) for t in con_10.tipos} == {(24, 5)}
    assert con_10.total_paneles == 5 * 4 * 24


def test_a_minimo_mayor_que_el_bloque_ideal_se_rechaza():
    with pytest.raises(LayoutImposible, match="A mínimo"):
        generar_layout(
            rectangulo(100, 60), [], PANEL_PLANO, ParametrosLayout(paneles_ancho=24, paneles_ancho_minimo=25), orientacion_norte=0
        )


def test_a_minimo_igual_al_ideal_solo_deja_bloques_completos():
    r = generar_layout(
        rectangulo(60, 40), [], PANEL_PLANO, ParametrosLayout(paneles_ancho=24, paneles_ancho_minimo=24), orientacion_norte=0
    )
    assert {t.paneles_ancho for t in r.tipos} == {24}


def test_cumple_rnf01_frente_al_optimo_teorico():
    """
    RNF-01: variación ≤ 5 % respecto al óptimo calculado manualmente.
    Para el rectángulo de 100 × 60 el óptimo contado es 1764.
    """
    r = generar_layout(rectangulo(100, 60), [], PANEL_PLANO, ParametrosLayout(paneles_ancho=24), orientacion_norte=0)
    assert r.total_paneles >= 0.95 * 1764


def test_rotar_terreno_y_norte_da_el_mismo_resultado():
    """
    Un terreno de 60 × 100 con el norte apuntando a +X (90°) es el mismo
    terreno de 100 × 60 con el norte hacia arriba.
    """
    r = generar_layout(rectangulo(60, 100), [], PANEL_PLANO, ParametrosLayout(paneles_ancho=24), orientacion_norte=90)
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
        terreno, caminos, PANEL_INCLINADO, ParametrosLayout(paneles_ancho=24), orientacion_norte=15, latitud=0.35
    )
    assert r.total_paneles > 0
    _validar_bloques(r, terreno, caminos, PASILLO)


def test_pasillo_configurable_se_respeta():
    terreno = rectangulo(120, 90)
    r = generar_layout(
        terreno,
        [],
        PANEL_PLANO,
        ParametrosLayout(paneles_ancho=24, pasillo_este_oeste_m=4, pasillo_norte_sur_m=4),
        orientacion_norte=0,
    )
    _validar_bloques(r, terreno, [], 4)
    assert r.separacion_norte_sur_m == 4


def test_los_dos_pasillos_son_independientes():
    """Pedido de Joseph (28 de noviembre): el pasillo este-oeste y el norte-sur no tienen que medir lo mismo."""
    terreno = rectangulo(120, 90)
    r = generar_layout(
        terreno,
        [],
        PANEL_PLANO,
        ParametrosLayout(paneles_ancho=24, pasillo_este_oeste_m=5, pasillo_norte_sur_m=1),
        orientacion_norte=0,
    )
    assert r.separacion_este_oeste_m == 5
    assert r.separacion_norte_sur_m == 1
    _validar_bloques(r, terreno, [], 1)


def test_la_latitud_ya_no_cambia_la_separacion():
    """
    Revisión del 25 de noviembre: la sombra se dejó de calcular. Antes,
    con 30° y latitud 0,35, la separación este-oeste subía a 2,008 m; ahora
    los bloques se separan solo por el pasillo, en las dos direcciones.
    """
    r = generar_layout(
        rectangulo(100, 60),
        [],
        PanelLayout(2278, 1134, 580, 30),
        ParametrosLayout(paneles_ancho=24, pasillo_este_oeste_m=0.5, pasillo_norte_sur_m=0.5),
        orientacion_norte=0,
        latitud=0.35,
    )
    assert r.separacion_este_oeste_m == 0.5
    assert r.separacion_norte_sur_m == 0.5
    assert not any("sombra" in a for a in r.advertencias)


def test_inclinacion_reduce_el_largo_en_planta():
    r = generar_layout(rectangulo(100, 60), [], PANEL_INCLINADO, ParametrosLayout(paneles_ancho=24), orientacion_norte=0)
    assert r.largo_bloque_m == pytest.approx(LARGO * math.cos(math.radians(7.5)), abs=1e-3)


# ─── Advertencias y errores ─────────────────────────────────────────


def test_advierte_sin_orientacion_y_no_pide_latitud():
    r = generar_layout(rectangulo(100, 60), [], PANEL_PLANO, ParametrosLayout(paneles_ancho=24))
    texto = " ".join(r.advertencias)
    assert "orientación del norte" in texto
    assert "latitud" not in texto


def test_terreno_demasiado_chico():
    with pytest.raises(LayoutImposible, match="No entra ningún bloque"):
        generar_layout(rectangulo(5, 5), [], PANEL_PLANO, ParametrosLayout(paneles_ancho=24), orientacion_norte=0)


def test_camino_que_cubre_todo_el_terreno():
    with pytest.raises(LayoutImposible):
        generar_layout(
            rectangulo(50, 50), [rectangulo(60, 60, -5, -5)], PANEL_PLANO, ParametrosLayout(paneles_ancho=24)
        )


@pytest.mark.parametrize("l", [0, 3, 5])
def test_l_impar_o_cero_se_rechaza(l):
    with pytest.raises(LayoutImposible, match="par"):
        generar_layout(rectangulo(100, 60), [], PANEL_PLANO, ParametrosLayout(paneles_ancho=24, paneles_largo=l))


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
        ParametrosLayout(paneles_ancho=24, capacidad_deseada_kwp=300),
        orientacion_norte=0,
    )
    c = r.capacidad
    assert c.cabe
    assert c.paneles_necesarios == 518
    assert 518 <= r.total_paneles < 518 + 4
    assert c.maxima_kwp == pytest.approx(1764 * 0.58, abs=0.01)
    assert c.instalada_kwp == pytest.approx(r.total_paneles * 0.58, abs=0.01)
    assert c.remanente_kwp == pytest.approx(c.maxima_kwp - c.instalada_kwp, abs=0.01)


def test_capacidad_con_a_minimo_no_deja_un_bloque_chico_al_final():
    """
    518 paneles: 5 bloques completos (480) y faltan 38 → el último se
    acortaría a ceil(38 / 4) = 10 filas. Con A mínimo 12 queda en 12:
    se instalan 528 paneles, unos más, en vez de un bloque chico.
    """
    r = generar_layout(
        rectangulo(100, 60),
        [],
        PANEL_PLANO,
        ParametrosLayout(paneles_ancho=24, capacidad_deseada_kwp=300, paneles_ancho_minimo=12),
        orientacion_norte=0,
    )
    assert r.capacidad.cabe
    assert r.capacidad.paneles_necesarios == 518
    assert r.total_paneles == 480 + 4 * 12
    assert min(t.paneles_ancho for t in r.tipos) == 12


def test_capacidad_nunca_deja_un_bloque_mas_angosto_que_3_aunque_a_minimo_este_en_1():
    """
    Revisión de UX del 21 de noviembre de 2026: un camino de acceso parte
    el terreno en tramos más chicos, y recortar a una capacidad deseada
    puede terminar en un bloque de 1 o 2 paneles — una estructura de
    soporte independiente para eso no es construible, aunque la potencia
    cuadre. Sin que el Gerente toque "A mínimo" (que sigue en 1, su
    valor por defecto), el recorte nunca deja un bloque de menos de 3.

    482 paneles necesarios: 20 bloques completos (480) y faltan 2, que
    acortados a ceil(2 / 4) = 1 fila serían un bloque de 4 × 1. Con el
    piso de 3, se instalan 4 × 3 = 12 en vez de 4, un poco más que lo
    justo, en vez de ese bloque.
    """
    camino = rectangulo(100, 4, 0, 28)
    r = generar_layout(
        rectangulo(100, 60),
        [camino],
        PANEL_PLANO,
        ParametrosLayout(paneles_ancho=24, capacidad_deseada_kwp=482 * 0.58),
        orientacion_norte=0,
    )
    assert r.capacidad.cabe
    assert r.capacidad.paneles_necesarios == 482
    assert r.total_paneles == 480 + 4 * 3
    assert min(t.paneles_ancho for t in r.tipos) == 3


def test_capacidad_elige_bloques_completos_en_el_centro_y_no_las_puntas():
    """
    Revisión del 21 de noviembre (captura del Gerente): terreno de 78 x 67 m
    dibujado sobre el mapa, girado 40 grados, Canadian 700 Wp a 7 grados,
    L = 4, A compacto (12) y 222 kWp. Antes el recorte iba de izquierda a
    derecha: llenaba la punta angosta del terreno con bloques cortos
    (4 x 9, 4 x 8 y 4 x 3) y dejaba vacío el resto. Ahora toma primero los
    bloques completos más cercanos al centro y solo acorta el último.
    """
    panel = PanelLayout(largo_mm=2384, ancho_mm=1303, potencia_wp=700, angulo_montaje=7)
    terreno = [list(p) for p in rotate(Polygon(rectangulo(78, 67)), 40, origin=(0, 0)).exterior.coords[:-1]]
    r = generar_layout(terreno, [], panel, ParametrosLayout(paneles_largo=4, capacidad_deseada_kwp=222), orientacion_norte=0)

    assert r.capacidad.cabe
    assert r.capacidad.paneles_necesarios == 318
    assert r.total_paneles == 320
    # Seis bloques completos de 4 x 12 y solo el último acortado
    assert sorted((t.paneles_ancho, t.repeticiones) for t in r.tipos) == [(8, 1), (12, 6)]

    # La planta queda alrededor del centro del terreno, no en una punta
    centro = Polygon(terreno).centroid
    xs = [sum(v[0] for v in b.vertices) / 4 for b in r.bloques]
    ys = [sum(v[1] for v in b.vertices) / 4 for b in r.bloques]
    assert math.hypot(sum(xs) / len(xs) - centro.x, sum(ys) / len(ys) - centro.y) < 8


def test_capacidad_que_no_cabe_devuelve_la_maxima():
    r = generar_layout(
        rectangulo(100, 60),
        [],
        PANEL_PLANO,
        ParametrosLayout(paneles_ancho=24, capacidad_deseada_kwp=5000),
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
    r = generar_layout(rectangulo(100, 60), [], PANEL_PLANO, ParametrosLayout(paneles_ancho=24), orientacion_norte=0)
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
