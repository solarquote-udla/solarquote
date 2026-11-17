"""
Mensajes de validación en español, con el campo (`loc`) correcto —
pedido de Joseph para que el frontend ponga cada error junto a su campo.
"""

from tests.test_varios_inversores import PANEL as PANEL_EQUIPO
from tests.test_varios_inversores import api, equipo, h, inversor, pid  # noqa: F401

PANEL = {"marca": "Jinko", "modelo": "X", "potencia_wp": 580, "largo_mm": 2278, "ancho_mm": 1134, "voc_v": 52, "vmp_v": 43}


def test_restriccion_de_campo_sale_en_espanol_con_el_campo(api, h):
    r = api.post("/api/paneles", headers=h, json={**PANEL, "potencia_wp": -5})
    assert r.status_code == 422
    errores = r.json()["detail"]
    assert {"loc": ["body", "potencia_wp"], "msg": "Debe ser mayor que 0.", "type": "greater_than"} in errores


def test_campo_faltante_sale_en_espanol(api, h):
    sin_marca = {k: v for k, v in PANEL.items() if k != "marca"}
    r = api.post("/api/paneles", headers=h, json=sin_marca)
    assert r.status_code == 422
    errores = r.json()["detail"]
    assert any(e["loc"] == ["body", "marca"] and e["msg"] == "Este campo es obligatorio." for e in errores)


def test_tipo_equivocado_sale_en_espanol(api, h):
    r = api.post("/api/paneles", headers=h, json={**PANEL, "potencia_wp": "abc"})
    assert r.status_code == 422
    errores = r.json()["detail"]
    assert any(e["loc"] == ["body", "potencia_wp"] and e["msg"] == "Debe ser un número." for e in errores)


def test_nuestro_value_error_conserva_el_mensaje_sin_el_prefijo_de_pydantic(api, h):
    r = api.post("/api/paneles", headers=h, json={**PANEL, "voc_v": 40, "vmp_v": 50})
    assert r.status_code == 422
    errores = r.json()["detail"]
    assert any("El Voc debe ser mayor que el Vmp" in e["msg"] and not e["msg"].startswith("Value error") for e in errores)


def test_varios_errores_de_campo_salen_todos_con_su_propio_loc(api, h):
    r = api.post("/api/paneles", headers=h, json={**PANEL, "marca": "", "potencia_wp": -5, "largo_mm": -1})
    assert r.status_code == 422
    locs = {tuple(e["loc"]) for e in r.json()["detail"]}
    assert ("body", "marca") in locs
    assert ("body", "potencia_wp") in locs
    assert ("body", "largo_mm") in locs


# ─── Reglas entre dos campos: el loc apunta al campo, no solo al cuerpo ───


def test_inversor_crear_vmax_menor_que_vmin_cae_en_vmin(api, h):
    r = api.post("/api/inversores", headers=h, json={"marca": "Huawei", "modelo": "M", "potencia_kw": 50, "vmax_v": 100, "vmin_v": 200})
    assert r.status_code == 422
    errores = r.json()["detail"]
    assert any(e["loc"] == ["body", "vmin_v"] for e in errores)


def test_panel_crear_voc_menor_que_vmp_cae_en_vmp(api, h):
    r = api.post("/api/paneles", headers=h, json={**PANEL, "voc_v": 40, "vmp_v": 50})
    assert r.status_code == 422
    errores = r.json()["detail"]
    assert any(e["loc"] == ["body", "vmp_v"] for e in errores)


def test_panel_crear_largo_menor_que_ancho_cae_en_ancho(api, h):
    r = api.post("/api/paneles", headers=h, json={**PANEL, "largo_mm": 1000, "ancho_mm": 1134})
    assert r.status_code == 422
    errores = r.json()["detail"]
    assert any(e["loc"] == ["body", "ancho_mm"] for e in errores)


def test_equipo_panel_voc_menor_que_vmp_cae_en_panel_vmp(api, h, pid):
    datos = equipo(inversor())
    datos["panel"] = {**PANEL_EQUIPO, "voc_v": 40, "vmp_v": 50}
    r = api.put(f"/api/proyectos/{pid}/equipo", headers=h, json=datos)
    assert r.status_code == 422
    errores = r.json()["detail"]
    assert any(e["loc"] == ["body", "panel", "vmp_v"] for e in errores)


def test_equipo_inversor_vmax_menor_que_vmin_cae_en_ese_inversor(api, h, pid):
    datos = equipo(inversor(vmax_v=100, vmin_v=200))
    r = api.put(f"/api/proyectos/{pid}/equipo", headers=h, json=datos)
    assert r.status_code == 422
    errores = r.json()["detail"]
    assert any(e["loc"] == ["body", "inversores", 0, "vmin_v"] for e in errores)


def test_inversor_actualizar_marca_null_cae_en_marca(api, h):
    iid = api.post("/api/inversores", headers=h, json={"marca": "Huawei", "modelo": "M", "potencia_kw": 50}).json()["id"]
    r = api.patch(f"/api/inversores/{iid}", headers=h, json={"marca": None})
    assert r.status_code == 422
    errores = r.json()["detail"]
    assert any(e["loc"] == ["body", "marca"] and e["msg"] == "No se puede borrar: marca" for e in errores)
