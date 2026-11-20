"""
Planta de una cotización desde el historial (pedido de Santi, 17 de
noviembre): GET /api/cotizaciones/{id}/planta devuelve el terreno y el
layout del proyecto con el permiso del historial.
"""

from datetime import timedelta
from decimal import Decimal

from app.core.permisos import Permiso
from app.models.cotizacion import Cotizacion
from app.services import layout as servicio_layout
from tests.fabricas import crear_usuario, perfil_personalizado
from tests.test_confirmacion import calc, cotizar, listo  # noqa: F401
from tests.test_varios_inversores import _cabecera, api, h, pid  # noqa: F401


def _cotizacion(api, h, pid) -> int:
    r = cotizar(api, h, pid, acepta_fuera_de_proporcion=True)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_devuelve_el_terreno_y_el_layout_cotizados(api, db, h, listo, calc):  # noqa: F811
    cid = _cotizacion(api, h, listo)

    r = api.get(f"/api/cotizaciones/{cid}/planta", headers=h)

    assert r.status_code == 200, r.text
    planta = r.json()
    assert planta["proyecto_id"] == listo
    assert len(planta["terreno"]["vertices"]) == 4
    assert planta["terreno"]["areas"]["area_bruta"] > 0
    assert len(planta["layout"]["bloques"]) > 0
    assert planta["layout"]["desactualizado"] is False
    assert planta["cambio_despues_de_cotizar"] is False


def test_lo_ve_quien_solo_tiene_historial(api, db, h, listo, calc):  # noqa: F811
    cid = _cotizacion(api, h, listo)
    solo_historial = _cabecera(crear_usuario(db, perfil_personalizado(db, Permiso.HISTORIAL)))

    r = api.get(f"/api/cotizaciones/{cid}/planta", headers=solo_historial)

    assert r.status_code == 200
    assert r.json()["layout"] is not None
    # Pero no puede abrir el Paso 3: el plano es de solo lectura
    assert api.get(f"/api/proyectos/{listo}/layout", headers=solo_historial).status_code == 403


def test_sin_permiso_de_historial_no_se_ve(api, db, h, listo, calc):  # noqa: F811
    cid = _cotizacion(api, h, listo)
    produccion = _cabecera(crear_usuario(db, perfil_personalizado(db, Permiso.DESPACHO)))

    assert api.get(f"/api/cotizaciones/{cid}/planta", headers=produccion).status_code == 403


def test_avisa_si_el_layout_cambio_despues_de_cotizar(api, db, h, listo, calc):  # noqa: F811
    cid = _cotizacion(api, h, listo)
    cotizacion = db.get(Cotizacion, cid)
    layout = servicio_layout.obtener_layout(db, listo)
    layout.updated_at = cotizacion.created_at + timedelta(minutes=5)
    db.flush()

    assert api.get(f"/api/cotizaciones/{cid}/planta", headers=h).json()["cambio_despues_de_cotizar"] is True


def test_cotizacion_sin_proyecto_no_tiene_planta(api, db, h):  # noqa: F811
    cotizacion = Cotizacion(
        usuario_id=crear_usuario(db).id,
        cliente_nombre="Directa",
        subtotal=Decimal("1"),
        total=Decimal("1.15"),
    )
    db.add(cotizacion)
    db.flush()

    planta = api.get(f"/api/cotizaciones/{cotizacion.id}/planta", headers=h).json()

    assert planta == {
        "cotizacion_id": cotizacion.id,
        "proyecto_id": None,
        "terreno": None,
        "layout": None,
        "cambio_despues_de_cotizar": False,
    }


def test_cotizacion_que_no_existe(api, h):  # noqa: F811
    assert api.get("/api/cotizaciones/999999/planta", headers=h).status_code == 404
