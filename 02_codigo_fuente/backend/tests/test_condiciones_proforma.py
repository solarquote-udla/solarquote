"""
Condiciones de la proforma desde la confirmación (acuerdo con Santi del
17 de noviembre): valores por defecto para el formulario y condiciones
editadas que llegan a la cotización por la API del Paso 3.
"""

from app.core.config import settings
from app.core.permisos import Permiso
from tests.fabricas import crear_usuario, perfil_personalizado
from tests.test_confirmacion import calc, cotizar, listo  # noqa: F401
from tests.test_varios_inversores import _cabecera, api, h, pid  # noqa: F401


def test_valores_por_defecto_de_la_configuracion(api, h):  # noqa: F811
    r = api.get("/api/proforma/condiciones", headers=h)

    assert r.status_code == 200
    datos = r.json()
    assert datos["plazo_dias"] == settings.PROFORMA_PLAZO_DIAS
    assert datos["validez_dias"] == settings.PROFORMA_VALIDEZ_DIAS
    assert datos["garantia_anios"] == settings.PROFORMA_GARANTIA_ANIOS
    assert float(datos["logistica_monto"]) == float(settings.PROFORMA_LOGISTICA_MONTO)
    assert [t["nombre"] for t in datos["pagos"]] == ["Anticipo", "Entrega", "A 60 días de la entrega"]
    assert sum(float(t["porcentaje"]) for t in datos["pagos"]) == 100


def test_los_lee_quien_puede_cotizar_y_nadie_mas(api, db):  # noqa: F811
    boceto = _cabecera(crear_usuario(db, perfil_personalizado(db, Permiso.CARGAR_BOCETO)))
    produccion = _cabecera(crear_usuario(db, perfil_personalizado(db, Permiso.DESPACHO)))

    assert api.get("/api/proforma/condiciones", headers=boceto).status_code == 200
    assert api.get("/api/proforma/condiciones", headers=produccion).status_code == 403


def test_condiciones_editadas_en_la_confirmacion_llegan_a_la_cotizacion(api, h, listo, calc):  # noqa: F811
    condiciones = {
        "plazo_dias": 25,
        "validez_dias": 2,
        "garantia_anios": 10,
        "pagos": [{"nombre": "Anticipo", "porcentaje": 40}, {"nombre": "Entrega total", "porcentaje": 60}],
    }
    r = cotizar(api, h, listo, acepta_fuera_de_proporcion=True, condiciones=condiciones)
    assert r.status_code == 201, r.text

    detalle = api.get(f"/api/cotizaciones/{r.json()['id']}", headers=h).json()
    assert (detalle["plazo_dias"], detalle["validez_dias"], detalle["garantia_anios"]) == (25, 2, 10)
    assert [(t["nombre"], float(t["porcentaje"])) for t in detalle["pagos"]] == [("Anticipo", 40), ("Entrega total", 60)]
    assert detalle["precio_wp"] is not None


def test_forma_de_pago_que_no_suma_100_se_rechaza(api, h, listo, calc):  # noqa: F811
    condiciones = {"pagos": [{"nombre": "Anticipo", "porcentaje": 40}, {"nombre": "Entrega", "porcentaje": 50}]}

    r = cotizar(api, h, listo, acepta_fuera_de_proporcion=True, condiciones=condiciones)

    assert r.status_code == 422
    assert r.json()["detail"][0]["loc"][-1] == "pagos"
