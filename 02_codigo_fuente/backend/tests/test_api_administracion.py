"""
Contrato HTTP de la administración: clientes (RF-12), materiales y precios
(RF-09) e inversores (RF-08).

Las reglas de negocio se prueban en los servicios (test_cliente_servicio,
test_material_administracion, test_inversor_administracion). Aquí se
prueba lo que solo existe en los routers: cómo cada error del servicio se
traduce a un código HTTP, y que cada operación exige su permiso.
Origen: matriz de trazabilidad (03_pruebas/trazabilidad), huecos de
cobertura de los routers.
"""

from decimal import Decimal

import pytest

from app.core.permisos import Permiso
from app.models.material import Material
from tests.fabricas import crear_usuario, perfil_personalizado
from tests.test_varios_inversores import _cabecera, api, h  # noqa: F401

INEXISTENTE = 999_999

CLIENTE = {"nombre": "SolarAndes Instalaciones", "tipo_identificacion": "ruc", "identificacion": "1091234567001"}
INVERSOR = {"marca": "Genérico", "modelo": "INV-200K", "potencia_kw": 200, "vmax_v": 1100, "vmin_v": 200, "mppts": 10, "strings_por_mppt": 2}


def con_permisos(db, *permisos: Permiso) -> dict:
    return _cabecera(crear_usuario(db, perfil=perfil_personalizado(db, *permisos)))


# ─── Clientes (RF-12) ───────────────────────────────────────────────


def test_cliente_ciclo_completo(api, h):
    r = api.post("/api/clientes", headers=h, json=CLIENTE)
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    assert api.get(f"/api/clientes/{cid}", headers=h).json()["nombre"] == CLIENTE["nombre"]

    r = api.patch(f"/api/clientes/{cid}", headers=h, json={"email": "proyectos@solarandes.ec"})
    assert r.status_code == 200 and r.json()["email"] == "proyectos@solarandes.ec"

    # Baja lógica: deja de aparecer en el listado de activos, pero se conserva
    assert api.delete(f"/api/clientes/{cid}", headers=h).status_code == 204
    assert api.get(f"/api/clientes/{cid}", headers=h).json()["activo"] is False


def test_cliente_errores_traducidos(api, h):
    cid = api.post("/api/clientes", headers=h, json=CLIENTE).json()["id"]
    otro = api.post("/api/clientes", headers=h, json={**CLIENTE, "identificacion": "1710034065001"}).json()["id"]

    assert api.post("/api/clientes", headers=h, json=CLIENTE).status_code == 409  # identificación repetida
    assert api.patch(f"/api/clientes/{otro}", headers=h, json={"identificacion": CLIENTE["identificacion"]}).status_code == 409
    assert api.patch(f"/api/clientes/{cid}", headers=h, json={"nombre": None}).status_code == 422  # campo obligatorio vacío
    assert api.post("/api/clientes", headers=h, json={**CLIENTE, "identificacion": "1234567890123"}).status_code == 422  # RUC inválido
    assert api.post("/api/clientes", headers=h, json={**CLIENTE, "identificacion": "1791234567001", "email": "sin-arroba"}).status_code == 422

    assert api.get(f"/api/clientes/{INEXISTENTE}", headers=h).status_code == 404
    assert api.patch(f"/api/clientes/{INEXISTENTE}", headers=h, json={"empresa": "X"}).status_code == 404
    assert api.delete(f"/api/clientes/{INEXISTENTE}", headers=h).status_code == 404


def test_clientes_lectura_y_administracion_por_permiso(api, db, h):
    cid = api.post("/api/clientes", headers=h, json=CLIENTE).json()["id"]

    # Quien cotiza lee los clientes para elegirlos, pero no los administra
    cotiza = con_permisos(db, Permiso.GENERAR_LAYOUT)
    assert api.get("/api/clientes", headers=cotiza).status_code == 200
    assert api.post("/api/clientes", headers=cotiza, json={**CLIENTE, "identificacion": "1710034065001"}).status_code == 403
    assert api.delete(f"/api/clientes/{cid}", headers=cotiza).status_code == 403

    ajeno = con_permisos(db, Permiso.DESPACHO)
    assert api.get("/api/clientes", headers=ajeno).status_code == 403

    administra = con_permisos(db, Permiso.CLIENTES)
    assert api.patch(f"/api/clientes/{cid}", headers=administra, json={"telefono": "099 123 4567"}).status_code == 200


# ─── Materiales y precios (RF-09) ───────────────────────────────────


def test_material_ciclo_completo(api, db, h):
    r = api.post("/api/materiales", headers=h, json={"codigo": "TORNILLO_M8", "nombre": "Tornillo M8"})
    assert r.status_code == 201, r.text
    mid = r.json()["id"]
    assert r.json()["precio_vigente"] is None

    r = api.patch(f"/api/materiales/{mid}/precio", headers=h, json={"precio": "0.35"})
    assert r.status_code == 200 and Decimal(r.json()["precio_vigente"]) == Decimal("0.35")
    api.patch(f"/api/materiales/{mid}/precio", headers=h, json={"precio": "0.40"})

    historial = api.get(f"/api/materiales/{mid}/precios", headers=h).json()
    assert [Decimal(p["precio"]) for p in historial][:2] in ([Decimal("0.40"), Decimal("0.35")], [Decimal("0.35"), Decimal("0.40")])
    assert api.get(f"/api/materiales/{mid}", headers=h).json()["codigo"] == "TORNILLO_M8"

    r = api.patch(f"/api/materiales/{mid}", headers=h, json={"activo": False})
    assert r.status_code == 200 and r.json()["activo"] is False


def test_material_errores_traducidos(api, db, h):
    api.post("/api/materiales", headers=h, json={"codigo": "TORNILLO_M8", "nombre": "Tornillo M8"})
    assert api.post("/api/materiales", headers=h, json={"codigo": "TORNILLO_M8", "nombre": "Otro"}).status_code == 409

    # Un material de las fórmulas no se desactiva: dejaría sin cotizar
    var = Material(codigo="VAR1650", nombre="Varilla 1650", unidad="u")
    db.add(var)
    db.flush()
    assert api.patch(f"/api/materiales/{var.id}", headers=h, json={"activo": False}).status_code == 409

    assert api.patch(f"/api/materiales/{var.id}/precio", headers=h, json={"precio": "-1"}).status_code == 422
    for metodo, ruta, cuerpo in [
        ("get", f"/api/materiales/{INEXISTENTE}", None),
        ("patch", f"/api/materiales/{INEXISTENTE}", {"nombre": "Nombre válido"}),
        ("get", f"/api/materiales/{INEXISTENTE}/precios", None),
        ("patch", f"/api/materiales/{INEXISTENTE}/precio", {"precio": "1.00"}),
    ]:
        assert getattr(api, metodo)(ruta, headers=h, **({"json": cuerpo} if cuerpo else {})).status_code == 404, ruta


def test_precios_y_materiales_por_permiso(api, db, h):
    mid = api.post("/api/materiales", headers=h, json={"codigo": "TORNILLO_M8", "nombre": "Tornillo M8"}).json()["id"]

    solo_precios = con_permisos(db, Permiso.PRECIOS)
    assert api.patch(f"/api/materiales/{mid}/precio", headers=solo_precios, json={"precio": "0.50"}).status_code == 200
    assert api.post("/api/materiales", headers=solo_precios, json={"codigo": "OTRO", "nombre": "Otro"}).status_code == 403

    solo_materiales = con_permisos(db, Permiso.MATERIALES)
    assert api.patch(f"/api/materiales/{mid}", headers=solo_materiales, json={"nombre": "Tornillo M8 galvanizado"}).status_code == 200
    assert api.patch(f"/api/materiales/{mid}/precio", headers=solo_materiales, json={"precio": "0.60"}).status_code == 403


# ─── Inversores (RF-08) ─────────────────────────────────────────────


def test_inversor_ciclo_completo_y_errores(api, h):
    r = api.post("/api/inversores", headers=h, json=INVERSOR)
    assert r.status_code == 201, r.text
    iid = r.json()["id"]
    assert api.get(f"/api/inversores/{iid}", headers=h).json()["modelo"] == "INV-200K"
    assert api.patch(f"/api/inversores/{iid}", headers=h, json={"potencia_kw": 215}).json()["potencia_kw"] == 215

    assert api.post("/api/inversores", headers=h, json=INVERSOR).status_code == 409  # misma marca y modelo
    otro = api.post("/api/inversores", headers=h, json={**INVERSOR, "modelo": "INV-100K"}).json()["id"]
    assert api.patch(f"/api/inversores/{otro}", headers=h, json={"modelo": "INV-200K"}).status_code == 409
    # RF-08: con los dos voltajes registrados, Vmax debe ser mayor que Vmin
    assert api.patch(f"/api/inversores/{iid}", headers=h, json={"vmin_v": 1200, "vmax_v": 1100}).status_code == 422

    assert api.get(f"/api/inversores/{INEXISTENTE}", headers=h).status_code == 404
    assert api.patch(f"/api/inversores/{INEXISTENTE}", headers=h, json={"potencia_kw": 1}).status_code == 404


@pytest.mark.parametrize("permiso,puede_crear", [(Permiso.INVERSORES, True), (Permiso.GENERAR_LAYOUT, False)])
def test_inversores_por_permiso(api, db, permiso, puede_crear):
    cabecera = con_permisos(db, permiso)
    assert api.get("/api/inversores", headers=cabecera).status_code == 200
    esperado = 201 if puede_crear else 403
    assert api.post("/api/inversores", headers=cabecera, json=INVERSOR).status_code == esperado
