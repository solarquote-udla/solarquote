"""Lectura directa de DXF (RF-04): bloques contados a mano."""

import pytest

from app.services.dxf import DxfIlegible, interpretar_dxf
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


def test_bloque_incompleto_se_advierte():
    r = interpretar_dxf(crear_dxf(PLANTA, quitar=3))
    assert any("no forman una grilla completa" in a for a in r.advertencias)


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
