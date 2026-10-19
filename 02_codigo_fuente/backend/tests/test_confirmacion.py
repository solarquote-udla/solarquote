"""
Confirmación del layout y cotización desde el layout (RF-05 → RF-06).

Terreno de 100 × 60 m con el panel Jinko de 580 Wp a 0°: 18 bloques
4 × 24 y 9 bloques cortos 4 × 1 (fuera de proporción), 1764 paneles,
1023,12 kWp (ver test_layout.py). calc-service se simula: lo que se
prueba aquí es qué se le manda y qué se guarda.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import httpx
import pytest
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.permisos import Permiso
from app.models.cotizacion import Cotizacion
from app.models.material import Material, PrecioMaterial
from app.services import layout as servicio_layout
from app.services.confirmacion import items_del_layout
from app.services.material import CODIGOS_FORMULA
from app.services.proforma import siguiente_numero_proforma
from tests.fabricas import crear_usuario, perfil_personalizado
from tests.test_varios_inversores import _cabecera, api, equipo, generar, guardar, h, inversor, pid  # noqa: F401

ANIO = datetime.now(timezone(timedelta(hours=-5))).year


def _sembrar_precios(db, *, sin: str | None = None) -> None:
    ayer = datetime.now(timezone.utc) - timedelta(days=1)
    for codigo in sorted(CODIGOS_FORMULA):
        material = Material(codigo=codigo, nombre=codigo, unidad="u")
        db.add(material)
        db.flush()
        if codigo != sin:
            db.add(PrecioMaterial(material_id=material.id, precio=Decimal("1.00"), vigente_desde=ayer))
    db.flush()


@pytest.fixture
def calc(monkeypatch) -> dict:
    """calc-service simulado: una unidad de cada material por bloque."""
    llamada: dict = {}

    def post_falso(url, *, json, headers, timeout):
        llamada["json"] = json
        bloques = sum(i["bloques"] for i in json["items"])
        cantidades = {codigo: bloques for codigo in json["precios"]}
        subtotal = Decimal(bloques * len(cantidades))
        return httpx.Response(
            200,
            json={
                "items": [{**i, "cantidades": {c: i["bloques"] for c in cantidades}} for i in json["items"]],
                "cantidades_totales": cantidades,
                "subtotal": str(subtotal),
                "addendum_porcentaje": "0",
                "addendum_monto": "0.00",
                "iva_porcentaje": "15",
                "iva_monto": str(subtotal * Decimal("0.15")),
                "total": str(subtotal * Decimal("1.15")),
            },
        )

    monkeypatch.setattr(httpx, "post", post_falso)
    return llamada


@pytest.fixture
def listo(api, db, h, pid):
    """Proyecto con equipo y layout generado, y los precios cargados."""
    _sembrar_precios(db)
    guardar(api, h, pid, equipo(inversor()))
    generar(api, h, pid)
    return pid


def cotizar(api, h, pid, **cuerpo):
    return api.post(f"/api/proyectos/{pid}/layout/cotizacion", headers=h, json=cuerpo)


# ─── Camino feliz ───────────────────────────────────────────────────


def test_confirmar_emite_la_cotizacion_con_los_bloques_del_layout(api, db, h, listo, calc):
    r = cotizar(api, h, listo, acepta_fuera_de_proporcion=True)
    assert r.status_code == 201, r.text
    emitida = r.json()

    # Bloques agrupados en ítems L, A, B: el tipo más repetido primero
    assert calc["json"]["items"] == [
        {"paneles_largo": 4, "paneles_ancho": 24, "bloques": 18},
        {"paneles_largo": 4, "paneles_ancho": 1, "bloques": 9},
    ]

    cotizacion = db.get(Cotizacion, emitida["id"])
    assert cotizacion.numero_proforma == emitida["numero_proforma"] == f"CT-001-{ANIO}"
    assert cotizacion.potencia_kwp == Decimal("1023.12")
    assert cotizacion.total_paneles == 1764
    assert cotizacion.cliente_nombre == "Cliente inversores"  # snapshot del cliente del proyecto
    assert cotizacion.proyecto_nombre == "Planta"

    proyecto = api.get(f"/api/proyectos/{listo}", headers=h).json()
    assert proyecto["estado"] == "cotizado"
    assert (proyecto["cotizacion_id"], proyecto["numero_proforma"]) == (emitida["id"], f"CT-001-{ANIO}")


def test_un_proyecto_se_cotiza_una_sola_vez(api, h, listo, calc):
    assert cotizar(api, h, listo, acepta_fuera_de_proporcion=True).status_code == 201
    r = cotizar(api, h, listo, acepta_fuera_de_proporcion=True)
    assert r.status_code == 409
    assert f"CT-001-{ANIO}" in r.json()["detail"]


# ─── Condiciones de RF-05 ───────────────────────────────────────────


def test_bloques_fuera_de_proporcion_exigen_aceptarlos(api, db, h, listo, calc):
    r = cotizar(api, h, listo)
    assert r.status_code == 409
    assert "9 bloque(s)" in r.json()["detail"]
    assert "json" not in calc  # ni se llegó a calcular
    assert db.query(Cotizacion).count() == 0


def test_sin_layout_no_se_cotiza(api, db, h, pid, calc):
    _sembrar_precios(db)
    guardar(api, h, pid, equipo(inversor()))
    r = cotizar(api, h, pid, acepta_fuera_de_proporcion=True)
    assert r.status_code == 409
    assert "Genera el layout" in r.json()["detail"]


def test_layout_desactualizado_no_se_cotiza(api, h, listo, calc):
    api.patch(f"/api/proyectos/{listo}/terreno", headers=h, json={"orientacion_norte": 10})
    r = cotizar(api, h, listo, acepta_fuera_de_proporcion=True)
    assert r.status_code == 409
    assert "Vuelve a generarlo" in r.json()["detail"]


def test_precio_faltante_no_deja_nada_a_medias(api, db, h, pid, calc):
    _sembrar_precios(db, sin="VAR1650")
    guardar(api, h, pid, equipo(inversor()))
    generar(api, h, pid)

    r = cotizar(api, h, pid, acepta_fuera_de_proporcion=True)
    assert r.status_code == 422
    assert db.query(Cotizacion).count() == 0
    assert api.get(f"/api/proyectos/{pid}", headers=h).json()["estado"] != "cotizado"


def test_calc_service_caido_es_502_y_no_cotiza(api, db, h, listo, monkeypatch):
    def caido(*args, **kwargs):
        raise httpx.ConnectError("sin conexión")

    monkeypatch.setattr(httpx, "post", caido)
    r = cotizar(api, h, listo, acepta_fuera_de_proporcion=True)
    assert r.status_code == 502
    assert db.query(Cotizacion).count() == 0


def test_requiere_permiso_de_generar_layout(api, db, listo, calc):
    otro = _cabecera(crear_usuario(db, perfil=perfil_personalizado(db, Permiso.CARGAR_BOCETO)))
    assert cotizar(api, otro, listo, acepta_fuera_de_proporcion=True).status_code == 403


def test_proyecto_inexistente_es_404(api, h, calc):
    assert cotizar(api, h, 999_999, acepta_fuera_de_proporcion=True).status_code == 404


# ─── Numeración de proformas ────────────────────────────────────────


def test_numeracion_correlativa_por_anio_desde_el_primer_numero(db, monkeypatch):
    monkeypatch.setattr(settings, "PROFORMA_PRIMER_NUMERO", 130)
    usuario = crear_usuario(db)

    def emitir(numero: str) -> None:
        db.add(Cotizacion(numero_proforma=numero, usuario_id=usuario.id, cliente_nombre="X"))
        db.flush()

    # Continúa la numeración que HEXtructure lleva a mano
    assert siguiente_numero_proforma(db, 2026) == "CT-130-2026"
    emitir("CT-130-2026")
    assert siguiente_numero_proforma(db, 2026) == "CT-131-2026"
    # Del 999 al 1000 sigue siendo correlativo (no se ordena como texto)
    emitir("CT-999-2026")
    assert siguiente_numero_proforma(db, 2026) == "CT-1000-2026"
    # Cada año empieza de nuevo
    assert siguiente_numero_proforma(db, 2027) == "CT-130-2027"
    # Números con otro formato (cargados a mano) no la desordenan
    emitir("PROFORMA-ESPECIAL")
    assert siguiente_numero_proforma(db, 2026) == "CT-1000-2026"


# ─── Revisión del PR #38 ────────────────────────────────────────────


def test_la_base_rechaza_un_inversor_negativo(api, db, h, listo):
    layout = servicio_layout.obtener_layout(db, listo)
    layout.bloques[0].inversor = -1
    with pytest.raises(IntegrityError, match="ck_bloques_layout_inversor_no_negativo"):
        db.flush()


def test_un_inversor_negativo_en_memoria_no_se_suma_al_ultimo(api, db, h, pid):
    guardar(api, h, pid, equipo(inversor(), inversor()))
    generar(api, h, pid)
    layout = servicio_layout.obtener_layout(db, pid)
    equipo_actual = servicio_layout.obtener_configuracion(db, pid)
    with db.no_autoflush:  # sin guardar: solo se prueba la lectura
        for b in layout.bloques:
            b.inversor = -1
        inversores = servicio_layout._inversores_del_layout(layout, equipo_actual)
    assert [i.bloques for i in inversores] == [len(layout.bloques), 0]
    db.rollback()


def test_items_del_layout_agrupa_bloques_iguales(api, db, h, listo):
    items = items_del_layout(servicio_layout.obtener_layout(db, listo))
    assert [(i.paneles_largo, i.paneles_ancho, i.bloques) for i in items] == [(4, 24, 18), (4, 1, 9)]
