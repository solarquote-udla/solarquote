"""
Bloque del Paso 3 según la revisión con HEXtructure del 17 de noviembre
de 2026: L y A los elige el Gerente, el sistema solo avisa si el bloque
no es compacto (A = 3 × L) y el bloque mide con la separación entre
paneles (6 cm a lo largo y 2 cm a lo ancho).
"""

import pytest

from tests.test_api_layout_a_minimo import api, proyecto  # noqa: F401

# Panel de 2278 × 1134 mm del equipo de prueba, L = 4
LARGO_CON_SEPARACION = 4 * 2.278 + 3 * 0.06
ANCHO_12_CON_SEPARACION = 12 * 1.134 + 11 * 0.02


def _generar(api, proyecto, **parametros):
    pid, h = proyecto
    r = api.post(f"/api/proyectos/{pid}/layout", headers=h, json={"paneles_largo": 4, **parametros})
    assert r.status_code == 200, r.text
    return r.json()


def test_por_defecto_bloque_compacto_con_separaciones(api, proyecto):
    layout = _generar(api, proyecto)
    assert layout["parametros"]["paneles_ancho"] is None
    assert layout["parametros"]["separacion_paneles_largo_m"] == 0.06
    assert layout["parametros"]["separacion_paneles_ancho_m"] == 0.02
    assert layout["paneles_ancho_ideal"] == 12
    assert layout["bloque_compacto"] is True
    assert layout["largo_bloque_m"] == pytest.approx(LARGO_CON_SEPARACION, abs=1e-3)
    assert layout["ancho_bloque_m"] == pytest.approx(ANCHO_12_CON_SEPARACION, abs=1e-3)
    assert layout["separacion_paneles_ancho_m"] == 0.02


def test_a_manual_se_guarda_y_avisa_si_no_es_compacto(api, proyecto):
    layout = _generar(api, proyecto, paneles_ancho=24)
    assert layout["parametros"]["paneles_ancho"] == 24
    assert layout["paneles_ancho_ideal"] == 24
    assert layout["bloque_compacto"] is False
    assert any("no es compacto" in a for a in layout["advertencias"])
    assert {t["paneles_ancho"] for t in layout["tipos"]} >= {24}


def test_l_grande_de_las_plantas_reales(api, proyecto):
    """Bloques de 22 × 28 como en la ampliación que mostró HEXtructure."""
    pid, h = proyecto
    api.patch(
        f"/api/proyectos/{pid}/terreno",
        headers=h,
        json={"vertices": [[0, 0], [200, 0], [200, 120], [0, 120]]},
    )
    layout = _generar(api, proyecto, paneles_largo=22, paneles_ancho=28)
    assert layout["tipos"][0]["paneles_largo"] == 22
    assert layout["tipos"][0]["paneles_ancho"] == 28


@pytest.mark.parametrize(
    "cuerpo",
    [
        {"paneles_ancho": 0},
        {"paneles_largo": 42},
        {"separacion_paneles_largo_m": -0.01},
        {"separacion_paneles_ancho_m": 0.6},
    ],
)
def test_valores_fuera_de_rango_responden_422(api, proyecto, cuerpo):
    pid, h = proyecto
    r = api.post(f"/api/proyectos/{pid}/layout", headers=h, json={"paneles_largo": 4, **cuerpo})
    assert r.status_code == 422


def test_editar_reconstruye_el_bloque_con_la_separacion(api, proyecto):
    """Guardar sin cambios no mueve nada: el backend arma el mismo rectángulo."""
    pid, h = proyecto
    layout = _generar(api, proyecto)
    edicion = {
        "bloques": [
            {"origen": b["vertices"][3], "paneles_ancho": b["paneles_ancho"], "inversor": b["inversor"]}
            for b in layout["bloques"]
        ]
    }
    r = api.put(f"/api/proyectos/{pid}/layout/bloques", headers=h, json=edicion)
    assert r.status_code == 200, r.text
    editado = r.json()
    assert editado["ediciones_manuales"] == 0
    assert [b["vertices"] for b in editado["bloques"]] == [b["vertices"] for b in layout["bloques"]]


def test_un_layout_anterior_se_lee_con_la_regla_en_paneles(api, proyecto, db):
    """
    Un layout guardado con la regla vieja (en metros) tenía 4 × 24 como
    "en proporción". Al leerlo se recalcula con A = 3 × L.
    """
    from app.models.layout import BloqueLayout

    pid, h = proyecto
    _generar(api, proyecto, paneles_ancho=24, separacion_paneles_largo_m=0, separacion_paneles_ancho_m=0)
    for b in db.query(BloqueLayout).all():
        b.en_proporcion = True
    db.flush()
    leido = api.get(f"/api/proyectos/{pid}/layout", headers=h).json()
    assert not any(b["en_proporcion"] for b in leido["bloques"] if b["paneles_ancho"] == 24)
