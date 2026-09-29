"""
Pruebas de los cálculos de RF-02.

Los valores esperados se pueden verificar a mano o con calculadora; los
casos de string usan los datos reales de los presets.
"""

import math

import pytest
from pydantic import ValidationError

from app.data.paneles_referencia import PANELES_REFERENCIA
from app.schemas.equipo import ConfiguracionEquipoGuardar, Inversor, Panel
from app.services.calculo_equipo import (
    area_panel_m2,
    elevacion_solar_minima,
    inversores_sugeridos,
    limites_string,
    separacion_entre_filas,
)


class TestAreaPanel:
    def test_panel_clase_2278(self):
        # 2,278 m × 1,134 m = 2,583252 m²
        assert area_panel_m2(2278, 1134) == pytest.approx(2.583252)


class TestElevacionSolar:
    def test_ecuador_linea_equinoccial(self):
        """En el ecuador el peor día el sol queda a 90 − 23,44 = 66,56°."""
        assert elevacion_solar_minima(0) == pytest.approx(66.56)

    def test_ibarra(self):
        # Latitud 0,3517 N → 90 − 23,7917 = 66,2083°
        assert elevacion_solar_minima(0.3517) == pytest.approx(66.2083)

    def test_simetrica_entre_hemisferios(self):
        """Loja (4° S) y un punto a 4° N deben dar lo mismo."""
        assert elevacion_solar_minima(-4) == elevacion_solar_minima(4)


class TestSeparacion:
    def test_panel_plano_no_proyecta_sombra(self):
        s = separacion_entre_filas(profundidad_m=2.278, angulo_montaje=0, latitud=0)
        assert s.altura_m == pytest.approx(0)
        assert s.sombra_m == pytest.approx(0)
        assert s.paso_minimo_m == pytest.approx(2.278)

    def test_caso_calculado_a_mano(self):
        """
        Panel de 2 m a 30° en el ecuador:
          h = 2 · sen 30° = 1,000 m
          p = 2 · cos 30° = 1,732 m
          s = 1 / tan 66,56° = 0,4336 m
          paso = 2,1657 m
        """
        s = separacion_entre_filas(profundidad_m=2.0, angulo_montaje=30, latitud=0)
        assert s.altura_m == pytest.approx(1.0)
        assert s.proyeccion_m == pytest.approx(math.sqrt(3))
        assert s.sombra_m == pytest.approx(1 / math.tan(math.radians(66.56)))
        assert s.paso_minimo_m == pytest.approx(math.sqrt(3) + 1 / math.tan(math.radians(66.56)))

    def test_factor_escala_con_la_profundidad(self):
        """RF-03 usará el factor para filas de varios paneles."""
        una = separacion_entre_filas(profundidad_m=2.278, angulo_montaje=15, latitud=0.35)
        dos = separacion_entre_filas(profundidad_m=2 * 2.278, angulo_montaje=15, latitud=0.35)
        assert dos.sombra_m == pytest.approx(2 * una.sombra_m)
        assert una.sombra_m == pytest.approx(2.278 * una.factor_sombra)


class TestLimitesString:
    def test_caso_del_documento(self):
        """
        Inversor 1100 V / 200 V con panel Voc 50 V, Vmp 42 V:
          máx = floor(1100 / 50) = 22
          mín = ceil(200 / 42)  = 5
        """
        r = limites_string(vmax_inversor=1100, vmin_inversor=200, voc_panel=50, vmp_panel=42)
        assert (r.paneles_min, r.paneles_max) == (5, 22)
        assert r.compatible is True

    def test_division_exacta_no_pierde_un_panel(self):
        """1100 / 50 = 22 exacto: no debe redondear hacia abajo a 21 por error de coma flotante."""
        r = limites_string(vmax_inversor=1100, vmin_inversor=100, voc_panel=50, vmp_panel=40)
        assert r.paneles_max == 22

    def test_preset_real_en_inversor_de_1500v(self):
        jinko = next(p for p in PANELES_REFERENCIA if p["clave"] == "jinko-jkm580n-72hl4")
        # floor(1500 / 52,31) = 28 ; ceil(500 / 43,35) = 12
        r = limites_string(1500, 500, jinko["voc_v"], jinko["vmp_v"])
        assert (r.paneles_min, r.paneles_max) == (12, 28)

    def test_incompatible_cuando_el_rango_se_cruza(self):
        # máx = floor(300/52) = 5 ; mín = ceil(260/43) = 7 → no existe largo válido
        r = limites_string(vmax_inversor=300, vmin_inversor=260, voc_panel=52, vmp_panel=43)
        assert r.compatible is False
        assert "No hay un largo de string" in r.motivo

    def test_incompatible_si_un_panel_ya_excede(self):
        r = limites_string(vmax_inversor=40, vmin_inversor=10, voc_panel=52, vmp_panel=43)
        assert r.compatible is False
        assert r.paneles_max == 0


class TestInversoresSugeridos:
    @pytest.mark.parametrize(
        ("paneles", "esperado"),
        [(0, 0), (1, 1), (400, 1), (401, 2), (1200, 3)],
    )
    def test_regla_400(self, paneles, esperado):
        assert inversores_sugeridos(paneles) == esperado


class TestValidacionSchemas:
    PANEL = dict(
        marca="Jinko Solar",
        modelo="JKM580N",
        potencia_wp=580,
        largo_mm=2278,
        ancho_mm=1134,
        voc_v=52.31,
        vmp_v=43.35,
    )
    INVERSOR = dict(marca="Huawei", modelo="SUN2000", potencia_kw=100)

    def test_configuracion_valida(self):
        ConfiguracionEquipoGuardar(panel=self.PANEL, angulo_montaje=15, inversor=self.INVERSOR)

    def test_voc_debe_superar_vmp(self):
        with pytest.raises(ValidationError, match="Voc debe ser mayor que el Vmp"):
            Panel(**{**self.PANEL, "voc_v": 40, "vmp_v": 43})

    def test_largo_es_el_lado_mayor(self):
        with pytest.raises(ValidationError, match="lado mayor"):
            Panel(**{**self.PANEL, "largo_mm": 1134, "ancho_mm": 2278})

    @pytest.mark.parametrize("angulo", [-1, 91])
    def test_angulo_fuera_de_rango(self, angulo):
        with pytest.raises(ValidationError):
            ConfiguracionEquipoGuardar(panel=self.PANEL, angulo_montaje=angulo, inversor=self.INVERSOR)

    def test_voltajes_del_inversor_van_juntos(self):
        with pytest.raises(ValidationError, match="ambos voltajes"):
            Inversor(**self.INVERSOR, vmax_v=1100)

    def test_vmax_mayor_que_vmin(self):
        with pytest.raises(ValidationError, match="mayor que el mínimo"):
            Inversor(**self.INVERSOR, vmax_v=200, vmin_v=500)


class TestPresets:
    @pytest.mark.parametrize("preset", PANELES_REFERENCIA, ids=lambda p: p["clave"])
    def test_cada_preset_pasa_las_validaciones(self, preset):
        """Un preset que no pasa sus propias validaciones sería un error de carga."""
        Panel(**{k: v for k, v in preset.items() if k not in ("clave", "fuente")})

    def test_claves_unicas(self):
        claves = [p["clave"] for p in PANELES_REFERENCIA]
        assert len(claves) == len(set(claves))
