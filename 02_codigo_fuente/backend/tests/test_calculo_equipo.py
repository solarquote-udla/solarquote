"""
Pruebas de los cálculos de RF-02.

Los valores esperados se pueden verificar a mano o con calculadora; los
casos de string usan los datos reales de los presets. Los inversores se
analizan con la relación DC/AC y sus entradas (revisión del 25 de
noviembre con Lenin, Santi y Anita), no con una regla fija de paneles.
"""


import pytest
from pydantic import ValidationError

from app.data.paneles_referencia import PANELES_REFERENCIA
from app.schemas.equipo import ConfiguracionEquipoGuardar, Inversor, Panel
from app.services.calculo_equipo import (
    InversorElectrico,
    analizar_inversores,
    area_panel_m2,
    limites_string,
    ocupacion_terreno,
    paneles_para_potencia,
    paneles_que_admite,
)


class TestAreaPanel:
    def test_panel_clase_2278(self):
        # 2,278 m × 1,134 m = 2,583252 m²
        assert area_panel_m2(2278, 1134) == pytest.approx(2.583252)


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


# Huawei SUN2000-330KTL del catálogo: 300 kW, 1500 / 500 V, 6 MPPT × 4 strings
SUN2000_330 = InversorElectrico(potencia_kw=300, vmax_v=1500, vmin_v=500, mppts=6, strings_por_mppt=4)
# Panel de 720 Wp con Voc 49,6 V y Vmp 41,3 V: strings de 13 a 30 paneles
VOC, VMP = 49.6, 41.3


class TestPanelesParaPotencia:
    def test_hacia_arriba(self):
        # 1.500 kWp ÷ 720 Wp = 2.083,3 → 2.084
        assert paneles_para_potencia(1500, 720) == 2084

    def test_potencia_exacta_no_suma_un_panel_por_redondeo(self):
        # 1.209,6 kWp ÷ 720 Wp = 1.680 justo (Envasur, CT203A)
        assert paneles_para_potencia(1209.6, 720) == 1680


class TestPanelesQueAdmite:
    def test_mppt_por_strings_por_panel_por_string(self):
        # 6 MPPT × 4 strings × floor(1500 / 49,6) = 6 × 4 × 30 = 720
        assert paneles_que_admite(SUN2000_330, VOC, VMP) == 720

    def test_sin_datos_del_inversor_no_se_calcula(self):
        assert paneles_que_admite(InversorElectrico(potencia_kw=300), VOC, VMP) is None

    def test_inversor_que_no_admite_el_panel(self):
        bajo = InversorElectrico(potencia_kw=10, vmax_v=40, vmin_v=30, mppts=2, strings_por_mppt=1)
        assert paneles_que_admite(bajo, VOC, VMP) == 0


class TestAnalisisInversores:
    def test_caso_de_anita_seis_de_300_para_1500_deja_reserva(self):
        """6 × 300 kW = 1.800 kW para 1.500 kWp: DC/AC 0,83, reserva para ampliaciones (Lenin: no es error)."""
        a = analizar_inversores(2084, 720, [SUN2000_330] * 6, VOC, VMP)
        assert a.relacion_dc_ac == pytest.approx(0.834, abs=1e-3)
        assert a.estado == "reserva"
        assert "queda reserva para ampliaciones" in a.mensajes[0]
        # Por potencia: 1.500,5 ÷ (300 × 1,3) = 3,85 → 4; por entradas: 2.084 ÷ 720 = 2,89 → 3
        assert a.sugeridos == 4
        assert a.cuenta == (
            "1.500,5 kWp ÷ (300 kW × 1,3) = 3,85; 2.084 paneles ÷ 720 que admite cada uno = 2,89. "
            "Se toma el mayor, hacia arriba: 4."
        )

    def test_relacion_normal_no_avisa(self):
        # 1.209,6 kWp con 4 × 300 kW = 1.200 kW: DC/AC 1,008
        a = analizar_inversores(1680, 720, [SUN2000_330] * 4, VOC, VMP)
        assert a.estado == "normal"
        assert a.mensajes == []

    def test_paneles_de_mas_recortan(self):
        a = analizar_inversores(2084, 720, [SUN2000_330] * 2, VOC, VMP)
        assert a.estado == "recorte"
        assert a.relacion_dc_ac == pytest.approx(2.501, abs=1e-3)
        assert any("recortarían la producción" in m and "se sugieren 4" in m for m in a.mensajes)

    def test_faltan_entradas(self):
        """2 inversores de 1.000 kW con 1 MPPT × 2 strings: la potencia alcanza, las entradas no."""
        grande = InversorElectrico(potencia_kw=1000, vmax_v=1500, vmin_v=500, mppts=1, strings_por_mppt=2)
        a = analizar_inversores(2084, 720, [grande] * 2, VOC, VMP)
        assert a.paneles_admitidos == 120
        assert any("faltan entradas" in m for m in a.mensajes)

    def test_sin_datos_electricos_se_sugiere_solo_por_potencia(self):
        a = analizar_inversores(2084, 720, [InversorElectrico(potencia_kw=300)] * 6)
        assert a.paneles_admitidos is None
        assert a.cuenta == "1.500,5 kWp ÷ (300 kW × 1,3) = 3,85. Se toma el mayor, hacia arriba: 4."

    def test_planta_chica_sugiere_un_inversor(self):
        assert analizar_inversores(10, 550, [SUN2000_330], VOC, VMP).sugeridos == 1

    def test_sin_paneles_o_sin_inversores_no_hay_analisis(self):
        assert analizar_inversores(0, 720, [SUN2000_330]) is None
        assert analizar_inversores(100, 720, []) is None


class TestOcupacionTerreno:
    def test_caso_de_anita_1500_kwp_en_3536_m2_no_cabe(self):
        """2.084 paneles de 2,384 × 1,303 m ocupan 6.474 m² en un terreno de 3.536 m²."""
        o = ocupacion_terreno(2084, 2384, 1303, 720, 3536)
        assert not o.cabe
        assert o.area_paneles_m2 == pytest.approx(6473.64, abs=0.01)
        # 3.536 ÷ 3,1064 = 1.138,3 → 1.138 paneles pegados, 819,4 kWp
        assert o.maximo_paneles == 1138
        assert o.mensaje == (
            "No caben: 2.084 paneles ocupan 6.474 m² y el terreno útil tiene 3.536 m². "
            "Aun sin pasillos, entran como máximo 1.138 paneles (819,4 kWp)."
        )

    def test_envasur_cabe_y_ocupa_el_89_por_ciento(self):
        """CT203A: 1.680 paneles en la planta de Envasur (5.878 m²)."""
        o = ocupacion_terreno(1680, 2384, 1303, 720, 5878)
        assert o.cabe and o.mensaje is None
        assert o.porcentaje == pytest.approx(88.8, abs=0.1)

    def test_sin_terreno_no_hay_calculo(self):
        assert ocupacion_terreno(100, 2384, 1303, 720, 0) is None


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
        ConfiguracionEquipoGuardar(panel=self.PANEL, angulo_montaje=15, inversores=[self.INVERSOR])

    def test_varios_inversores_y_potencia_objetivo(self):
        c = ConfiguracionEquipoGuardar(
            panel=self.PANEL, angulo_montaje=15, inversores=[self.INVERSOR] * 3, potencia_objetivo_kwp=316
        )
        assert len(c.inversores) == 3

    def test_al_menos_un_inversor(self):
        with pytest.raises(ValidationError):
            ConfiguracionEquipoGuardar(panel=self.PANEL, angulo_montaje=15, inversores=[])

    def test_tope_de_inversores(self):
        with pytest.raises(ValidationError):
            ConfiguracionEquipoGuardar(panel=self.PANEL, angulo_montaje=15, inversores=[self.INVERSOR] * 51)

    @pytest.mark.parametrize("objetivo", [0, -5])
    def test_potencia_objetivo_positiva(self, objetivo):
        with pytest.raises(ValidationError):
            ConfiguracionEquipoGuardar(
                panel=self.PANEL, angulo_montaje=15, inversores=[self.INVERSOR], potencia_objetivo_kwp=objetivo
            )

    def test_cada_inversor_se_valida(self):
        with pytest.raises(ValidationError, match="mayor que el mínimo"):
            ConfiguracionEquipoGuardar(
                panel=self.PANEL,
                angulo_montaje=15,
                inversores=[self.INVERSOR, {**self.INVERSOR, "vmax_v": 200, "vmin_v": 500}],
            )

    def test_voc_debe_superar_vmp(self):
        with pytest.raises(ValidationError, match="Voc debe ser mayor que el Vmp"):
            Panel(**{**self.PANEL, "voc_v": 40, "vmp_v": 43})

    def test_largo_es_el_lado_mayor(self):
        with pytest.raises(ValidationError, match="lado mayor"):
            Panel(**{**self.PANEL, "largo_mm": 1134, "ancho_mm": 2278})

    @pytest.mark.parametrize("angulo", [-1, 91])
    def test_angulo_fuera_de_rango(self, angulo):
        with pytest.raises(ValidationError):
            ConfiguracionEquipoGuardar(panel=self.PANEL, angulo_montaje=angulo, inversores=[self.INVERSOR])

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
