"""
Pruebas del cálculo de áreas — RF-01.

Los casos usan figuras cuya área se puede verificar a mano, para que un
fallo señale el error y no obligue a confiar en la misma librería que se
está probando.
"""

import pytest

from app.services.geometria import (
    GeometriaInvalida,
    area_poligono,
    calcular_areas,
    camino_dentro_del_terreno,
)

# Rectángulo de 100 × 50 m = 5 000 m²
TERRENO = [[0, 0], [100, 0], [100, 50], [0, 50]]


class TestAreaPoligono:
    def test_rectangulo(self):
        assert area_poligono(TERRENO) == pytest.approx(5000.0)

    def test_triangulo(self):
        # Base 10, altura 10 → 50 m²
        assert area_poligono([[0, 0], [10, 0], [0, 10]]) == pytest.approx(50.0)

    def test_orden_de_vertices_no_altera_el_area(self):
        """El área no debe depender de si se recorre horario o antihorario."""
        horario = [[0, 0], [0, 50], [100, 50], [100, 0]]
        assert area_poligono(horario) == pytest.approx(area_poligono(TERRENO))

    def test_menos_de_tres_vertices(self):
        with pytest.raises(GeometriaInvalida, match="al menos 3 vértices"):
            area_poligono([[0, 0], [10, 0]])

    def test_vertices_colineales(self):
        """Tres puntos sobre una recta no encierran superficie."""
        with pytest.raises(GeometriaInvalida, match="área nula"):
            area_poligono([[0, 0], [5, 0], [10, 0]])

    def test_poligono_que_se_cruza(self):
        """Un polígono en forma de moño no tiene área definida."""
        moño = [[0, 0], [10, 10], [10, 0], [0, 10]]
        with pytest.raises(GeometriaInvalida, match="se cruza consigo mismo"):
            area_poligono(moño)


class TestCalcularAreas:
    def test_sin_caminos(self):
        areas = calcular_areas(TERRENO, [])
        assert areas["area_bruta"] == pytest.approx(5000.0)
        assert areas["area_caminos"] == 0.0
        assert areas["area_util"] == pytest.approx(5000.0)

    def test_un_camino(self):
        # Franja vertical de 10 × 50 = 500 m²
        camino = [[45, 0], [55, 0], [55, 50], [45, 50]]
        areas = calcular_areas(TERRENO, [camino])

        assert areas["area_caminos"] == pytest.approx(500.0)
        assert areas["area_util"] == pytest.approx(4500.0)

    def test_caminos_que_se_cruzan_no_se_cuentan_dos_veces(self):
        """
        El caso que motivó usar Shapely.

        Un camino vertical de 10 × 50 (500 m²) y uno horizontal de
        100 × 10 (1 000 m²) se cruzan en un cuadrado de 10 × 10 (100 m²).

        Sumar las áreas por separado daría 1 500 m². Lo correcto es
        1 400 m², porque la intersección pertenece a ambos.
        """
        vertical = [[45, 0], [55, 0], [55, 50], [45, 50]]
        horizontal = [[0, 20], [100, 20], [100, 30], [0, 30]]

        areas = calcular_areas(TERRENO, [vertical, horizontal])

        assert areas["area_caminos"] == pytest.approx(1400.0)
        assert areas["area_util"] == pytest.approx(3600.0)

    def test_camino_que_sobresale_solo_descuenta_la_parte_interior(self):
        """
        Un camino de acceso arranca en la vía pública, fuera del predio.

        Solo debe descontar los metros que efectivamente pisan el
        terreno: el tramo exterior nunca estuvo disponible.
        """
        # De x=-20 a x=20, ancho 10 → 400 m² totales, 200 m² dentro
        acceso = [[-20, 20], [20, 20], [20, 30], [-20, 30]]

        areas = calcular_areas(TERRENO, [acceso])

        assert areas["area_caminos"] == pytest.approx(200.0)
        assert areas["area_util"] == pytest.approx(4800.0)

    def test_camino_que_cubre_todo_el_terreno(self):
        """Caso degenerado: no queda superficie útil, pero no debe reventar."""
        areas = calcular_areas(TERRENO, [TERRENO])

        assert areas["area_util"] == pytest.approx(0.0)
        assert areas["area_util"] >= 0

    def test_terreno_invalido_se_reporta_como_terreno(self):
        with pytest.raises(GeometriaInvalida, match="El terreno"):
            calcular_areas([[0, 0], [1, 1]], [])

    def test_camino_invalido_indica_cual(self):
        bueno = [[0, 0], [10, 0], [10, 10], [0, 10]]
        malo = [[0, 0], [1, 1]]

        with pytest.raises(GeometriaInvalida, match="El camino 2"):
            calcular_areas(TERRENO, [bueno, malo])


class TestContencion:
    def test_camino_interior(self):
        camino = [[10, 10], [20, 10], [20, 20], [10, 20]]
        assert camino_dentro_del_terreno(TERRENO, camino) is True

    def test_camino_que_sale_del_predio(self):
        acceso = [[-20, 20], [20, 20], [20, 30], [-20, 30]]
        assert camino_dentro_del_terreno(TERRENO, acceso) is False
