"""
Varios inversores por proyecto (RF-02) y bloques asignados a cada uno
(RF-03), probados por la API como los usa el asistente.

Terreno de 100 × 60 m con el panel Jinko de 580 Wp a 0°: 27 bloques y
1764 paneles (ver test_layout.py). Con string de 21 paneles (1100 V /
52,31 V), cada inversor de 2 MPPT × 10 strings admite 420 paneles.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permisos import Permiso
from app.core.security import crear_access_token
from app.main import app
from app.models.cliente import Cliente, TipoIdentificacion
from tests.fabricas import crear_usuario, perfil_personalizado

PANEL = {
    "marca": "Jinko", "modelo": "JKM580N", "potencia_wp": 580,
    "largo_mm": 2278, "ancho_mm": 1134, "voc_v": 52.31, "vmp_v": 43.35,
}


def inversor(potencia_kw: float = 250, **extra) -> dict:
    return {
        "marca": "Huawei", "modelo": "SUN2000", "potencia_kw": potencia_kw,
        "vmax_v": 1100, "vmin_v": 200, "mppts": 2, "strings_por_mppt": 10, **extra,
    }


def equipo(*inversores: dict, objetivo: float | None = None) -> dict:
    return {"panel": PANEL, "angulo_montaje": 0, "inversores": list(inversores), "potencia_objetivo_kwp": objetivo}


@pytest.fixture
def api(db: Session):
    app.dependency_overrides[get_db] = lambda: db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


def _cabecera(usuario) -> dict:
    return {"Authorization": f"Bearer {crear_access_token(usuario_id=usuario.id, version=usuario.version_token)}"}


@pytest.fixture
def h(db: Session) -> dict:
    return _cabecera(crear_usuario(db))


@pytest.fixture
def pid(api, db, h) -> int:
    cliente = Cliente(nombre="Cliente inversores", tipo_identificacion=TipoIdentificacion.RUC, identificacion="1710034065001")
    db.add(cliente)
    db.flush()
    proyecto = api.post(
        "/api/proyectos",
        headers=h,
        json={"nombre": "Planta", "cliente_id": cliente.id, "ubicacion": None, "latitud": None, "longitud": None, "notas": None},
    ).json()["id"]
    r = api.post(
        f"/api/proyectos/{proyecto}/terreno",
        headers=h,
        json={"vertices": [[0, 0], [100, 0], [100, 60], [0, 60]], "orientacion_norte": 0, "notas": None, "caminos": []},
    )
    assert r.status_code == 201, r.text
    return proyecto


def guardar(api, h, pid, datos) -> dict:
    r = api.put(f"/api/proyectos/{pid}/equipo", headers=h, json=datos)
    assert r.status_code == 200, r.text
    return r.json()


def generar(api, h, pid) -> dict:
    r = api.post(f"/api/proyectos/{pid}/layout", headers=h, json={})
    assert r.status_code == 200, r.text
    return r.json()


def leer(api, h, pid) -> dict:
    r = api.get(f"/api/proyectos/{pid}/layout", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def paneles_por_inversor(layout: dict) -> list[int]:
    return [i["paneles"] for i in layout["inversores"]]


def como_edicion(layout: dict, inversores: dict[int, int | None] | None = None) -> dict:
    """Los bloques actuales como los manda la pantalla, cambiando el inversor de algunos."""
    inversores = inversores or {}
    return {
        "bloques": [
            {
                "origen": b["vertices"][3],
                "paneles_ancho": b["paneles_ancho"],
                "inversor": inversores.get(i, b["inversor"]),
            }
            for i, b in enumerate(layout["bloques"])
        ]
    }


# ─── Equipo (RF-02) ─────────────────────────────────────────────────


def test_guardar_y_leer_varios_inversores(api, h, pid):
    respuesta = guardar(api, h, pid, equipo(inversor(160), inversor(100, modelo="SUN2000-100KTL", vmax_v=None, vmin_v=None)))

    assert [(i["modelo"], i["potencia_kw"]) for i in respuesta["inversores"]] == [("SUN2000", 160), ("SUN2000-100KTL", 100)]
    # Límites de string por inversor, en el mismo orden; el segundo no tiene voltajes
    strings = respuesta["calculos"]["strings"]
    assert strings[0]["paneles_max"] == 21
    assert strings[1] is None
    assert any("inversor 2" in a for a in respuesta["calculos"]["advertencias"])

    leido = api.get(f"/api/proyectos/{pid}/equipo", headers=h).json()
    assert leido["inversores"] == respuesta["inversores"]


def test_sugerencia_con_potencia_objetivo(api, h, pid):
    respuesta = guardar(api, h, pid, equipo(inversor(), objetivo=500))
    # 500 kWp / 0,58 = 862,07 → 863 paneles → 3 inversores de 288
    assert respuesta["calculos"]["sugerencia"] == {
        "paneles": 863, "potencia_kwp": 500.54, "inversores": 3, "paneles_por_inversor": 288, "kwp_por_inversor": 167.04,
    }
    assert any("se sugieren 3 inversor(es)" in a for a in respuesta["calculos"]["advertencias"])

    sin_objetivo = guardar(api, h, pid, equipo(inversor()))
    assert sin_objetivo["calculos"]["sugerencia"] is None
    assert sin_objetivo["potencia_objetivo_kwp"] is None


def test_cambiar_la_cantidad_de_inversores_varias_veces(api, h, pid):
    """Se reutilizan las filas: agregar y quitar no choca con la unicidad del orden."""
    for cantidad in (2, 1, 4, 3, 1):
        respuesta = guardar(api, h, pid, equipo(*[inversor(100 + n) for n in range(cantidad)]))
        assert [i["potencia_kw"] for i in respuesta["inversores"]] == [100 + n for n in range(cantidad)]


def test_equipo_sin_inversores_es_422(api, h, pid):
    r = api.put(f"/api/proyectos/{pid}/equipo", headers=h, json=equipo())
    assert r.status_code == 422


# ─── Layout (RF-03) ─────────────────────────────────────────────────


def test_generar_reparte_los_bloques_entre_los_inversores(api, h, pid):
    guardar(api, h, pid, equipo(inversor(160), inversor(160)))
    layout = generar(api, h, pid)

    assert {b["inversor"] for b in layout["bloques"]} == {0, 1}
    assert paneles_por_inversor(layout) == [880, 884]
    primero = layout["inversores"][0]
    assert (primero["numero"], primero["bloques"]) == (1, 13)
    assert primero["potencia_kwp"] == pytest.approx(880 * 0.58)
    assert primero["relacion_dc_ac"] == pytest.approx(880 * 0.58 / 160, abs=0.01)
    # 880 paneles = 41 strings de 21 (sobran 19) → 21 por MPPT y admite 10
    assert (primero["strings"], primero["paneles_sin_string"]) == (41, 19)
    assert primero["compatible"] is False
    assert layout["inversores_sugeridos"] == 5


def test_un_solo_inversor_se_lleva_todos_los_bloques(api, h, pid):
    guardar(api, h, pid, equipo(inversor()))
    layout = generar(api, h, pid)
    assert {b["inversor"] for b in layout["bloques"]} == {0}
    assert paneles_por_inversor(layout) == [1764]


def test_cambiar_la_cantidad_de_inversores_reparte_sin_regenerar(api, h, pid):
    guardar(api, h, pid, equipo(inversor(), inversor()))
    antes = generar(api, h, pid)

    guardar(api, h, pid, equipo(*[inversor()] * 5))
    despues = leer(api, h, pid)

    assert not despues["desactualizado"]
    assert [b["vertices"] for b in despues["bloques"]] == [b["vertices"] for b in antes["bloques"]]
    assert {b["inversor"] for b in despues["bloques"]} == {0, 1, 2, 3, 4}
    assert sum(paneles_por_inversor(despues)) == 1764

    # Volver a uno: ningún bloque queda apuntando a un inversor que no existe
    guardar(api, h, pid, equipo(inversor()))
    assert {b["inversor"] for b in leer(api, h, pid)["bloques"]} == {0}


def test_cambiar_datos_de_un_inversor_conserva_la_asignacion(api, h, pid):
    guardar(api, h, pid, equipo(inversor(), inversor()))
    generar(api, h, pid)
    a_mano = api.put(f"/api/proyectos/{pid}/layout/bloques", headers=h, json=como_edicion(leer(api, h, pid), {0: 1})).json()

    guardar(api, h, pid, equipo(inversor(), inversor(strings_por_mppt=30)))
    despues = leer(api, h, pid)

    assert not despues["desactualizado"]
    assert [b["inversor"] for b in despues["bloques"]] == [b["inversor"] for b in a_mano["bloques"]]
    # La eléctrica se calcula con los datos nuevos: 30 strings por MPPT alcanzan
    assert despues["inversores"][1]["compatible"] is True


def test_cambiar_el_panel_si_desactualiza(api, h, pid):
    guardar(api, h, pid, equipo(inversor()))
    generar(api, h, pid)
    guardar(api, h, pid, {**equipo(inversor()), "panel": {**PANEL, "potencia_wp": 600}})
    assert leer(api, h, pid)["desactualizado"]


# ─── Edición y reagrupar ────────────────────────────────────────────


def test_pasar_un_bloque_a_otro_inversor(api, h, pid):
    guardar(api, h, pid, equipo(inversor(), inversor()))
    layout = generar(api, h, pid)
    assert layout["bloques"][0]["inversor"] == 0

    r = api.put(f"/api/proyectos/{pid}/layout/bloques", headers=h, json=como_edicion(layout, {0: 1}))
    assert r.status_code == 200, r.text
    editado = r.json()
    assert editado["bloques"][0]["inversor"] == 1
    movidos = layout["bloques"][0]["paneles"]
    assert paneles_por_inversor(editado) == [880 - movidos, 884 + movidos]


def test_bloque_sin_inversor_reparte_todo(api, h, pid):
    guardar(api, h, pid, equipo(inversor(), inversor()))
    layout = generar(api, h, pid)
    edicion = como_edicion(layout, {0: 1, 1: None})
    editado = api.put(f"/api/proyectos/{pid}/layout/bloques", headers=h, json=edicion).json()
    # El cambio a mano del bloque 0 no se respeta: se repartió de nuevo
    assert [b["inversor"] for b in editado["bloques"]] == [b["inversor"] for b in layout["bloques"]]


def test_inversor_inexistente_reparte_todo(api, h, pid):
    guardar(api, h, pid, equipo(inversor(), inversor()))
    layout = generar(api, h, pid)
    editado = api.put(f"/api/proyectos/{pid}/layout/bloques", headers=h, json=como_edicion(layout, {0: 7})).json()
    assert {b["inversor"] for b in editado["bloques"]} == {0, 1}
    assert paneles_por_inversor(editado) == [880, 884]


def test_inversor_negativo_es_422(api, h, pid):
    guardar(api, h, pid, equipo(inversor()))
    layout = generar(api, h, pid)
    r = api.put(f"/api/proyectos/{pid}/layout/bloques", headers=h, json=como_edicion(layout, {0: -1}))
    assert r.status_code == 422


def test_reagrupar_deshace_los_cambios_a_mano(api, h, pid):
    guardar(api, h, pid, equipo(inversor(), inversor()))
    original = generar(api, h, pid)
    api.put(f"/api/proyectos/{pid}/layout/bloques", headers=h, json=como_edicion(original, {0: 1, 1: 1}))

    r = api.post(f"/api/proyectos/{pid}/layout/reagrupar", headers=h)
    assert r.status_code == 200, r.text
    reagrupado = r.json()
    assert [b["inversor"] for b in reagrupado["bloques"]] == [b["inversor"] for b in original["bloques"]]
    # Cambiar inversores no es una edición de la geometría
    assert reagrupado["ediciones_manuales"] == 0


def test_reagrupar_sin_layout_es_409(api, h, pid):
    guardar(api, h, pid, equipo(inversor()))
    assert api.post(f"/api/proyectos/{pid}/layout/reagrupar", headers=h).status_code == 409


def test_reagrupar_un_layout_desactualizado_es_409(api, h, pid):
    guardar(api, h, pid, equipo(inversor(), inversor()))
    generar(api, h, pid)
    api.patch(f"/api/proyectos/{pid}/terreno", headers=h, json={"orientacion_norte": 10})
    r = api.post(f"/api/proyectos/{pid}/layout/reagrupar", headers=h)
    assert r.status_code == 409
    assert "Vuelve a generarlo" in r.json()["detail"]


def test_reagrupar_requiere_permiso_de_generar_layout(api, db, h, pid):
    guardar(api, h, pid, equipo(inversor()))
    generar(api, h, pid)
    otro = _cabecera(crear_usuario(db, perfil=perfil_personalizado(db, Permiso.CLIENTES)))
    assert api.post(f"/api/proyectos/{pid}/layout/reagrupar", headers=otro).status_code == 403
