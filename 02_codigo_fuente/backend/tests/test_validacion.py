"""
Validación de materiales: despacho (RF-14), recepción (RF-15) y estado de
la propuesta (RF-16).

Se prueban las reglas del ciclo (cotizada → despachada → recibida →
instalada), la comparación de cantidades, la justificación y las
observaciones obligatorias, los permisos de cada opción del menú, las
fotos y el conteo con IA (ia-service simulado).
"""

import json
import threading
import time
from datetime import datetime, timezone
from decimal import Decimal

import httpx
import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.permisos import Permiso
from app.models.cotizacion import Cotizacion, EstadoCotizacion, MaterialCotizado
from app.models.material import Material
from app.models.perfil import Perfil
from app.models.usuario import Usuario
from app.models.validacion import Despacho, ItemRecepcion
from app.services import validacion as servicio
from app.services.tablero import obtener_tablero
from tests.fabricas import crear_usuario, perfil_produccion, perfil_personalizado
from tests.test_varios_inversores import _cabecera, api, h  # noqa: F401

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 100
JPG = b"\xff\xd8\xff\xe0" + b"1" * 100
PDF = b"%PDF-1.7\n" + b"0" * 100

TRAZABILIDAD = {
    "fabricado_por": "Carlos Pozo",
    "soldado_por": "Luis Andrade",
    "contado_por": "María Tapia",
    "despachado_por": "Jorge Vela",
    "destino": "Hacienda San José, Cayambe",
}


@pytest.fixture(autouse=True)
def secreto(monkeypatch):
    monkeypatch.setattr(settings, "IA_SERVICE_SECRET", "secreto-de-prueba")


def _cotizacion(db: Session, cantidades: dict[str, int] | None = None, numero: str = "CT-901-2026") -> Cotizacion:
    cantidades = cantidades or {"VAR1650": 352, "VAR1350": 374, "LOG": 1}
    materiales = []
    for codigo, cantidad in cantidades.items():
        material = db.scalar(select(Material).where(Material.codigo == codigo))
        if material is None:
            material = Material(codigo=codigo, nombre=f"Material {codigo}", unidad="u")
            db.add(material)
            db.flush()
        materiales.append(MaterialCotizado(material_id=material.id, cantidad=cantidad, precio_unitario=Decimal("1.00")))
    cotizacion = Cotizacion(
        numero_proforma=numero,
        usuario_id=crear_usuario(db, nombre="Santiago Guagalango").id,
        cliente_nombre="Agrícola San José",
        proyecto_nombre="Hacienda San José",
        total=Decimal("100.00"),
        materiales=materiales,
    )
    db.add(cotizacion)
    db.flush()
    return cotizacion


def _ids(db: Session, cotizacion: Cotizacion) -> dict[str, int]:
    return {m.material.codigo: m.material_id for m in cotizacion.materiales}


def _items_despacho(db, cotizacion, cambios: dict[str, int] | None = None) -> list[dict]:
    cambios = cambios or {}
    return [
        {"material_id": m.material_id, "cantidad_despachada": cambios.get(m.material.codigo, m.cantidad)}
        for m in cotizacion.materiales
    ]


def _despacho(api, h, cid: int, datos: dict, fotos: list[tuple[str, bytes]] | None = None):
    archivos = [("fotos", (nombre, contenido, "application/octet-stream")) for nombre, contenido in (fotos or [])]
    return api.post(
        f"/api/validacion/cotizaciones/{cid}/despacho",
        headers=h,
        data={"datos": json.dumps(datos)},
        files=archivos or None,
    )


def _recepcion(api, h, cid: int, datos: dict, fotos: list[tuple[str, bytes]] | None = None):
    archivos = [("fotos", (nombre, contenido, "application/octet-stream")) for nombre, contenido in (fotos or [])]
    return api.post(
        f"/api/validacion/cotizaciones/{cid}/recepcion",
        headers=h,
        data={"datos": json.dumps(datos)},
        files=archivos or None,
    )


def _despachar(api, h, db, cotizacion, cambios=None, justificacion=None):
    datos = {**TRAZABILIDAD, "items": _items_despacho(db, cotizacion, cambios), "justificacion": justificacion}
    r = _despacho(api, h, cotizacion.id, datos)
    assert r.status_code == 201, r.text
    return r.json()


def _checklist_ok(cotizacion) -> list[dict]:
    return [{"material_id": m.material_id, "estado": "ok"} for m in cotizacion.materiales]


# ─── RF-14: despacho ────────────────────────────────────────────────


def test_despacho_sin_diferencias_pasa_a_despachada(api, db, h):
    c = _cotizacion(db)
    cuerpo = _despachar(api, h, db, c)

    assert cuerpo["estado"] == "despachada"
    d = cuerpo["despacho"]
    assert d["con_diferencias"] is False and d["justificacion"] is None
    assert d["fabricado_por"] == "Carlos Pozo" and d["destino"] == "Hacienda San José, Cayambe"
    assert [i["codigo"] for i in d["items"]] == ["LOG", "VAR1350", "VAR1650"]
    assert all(i["cantidad_despachada"] == i["cantidad_cotizada"] and i["diferencia"] == 0 for i in d["items"])
    etapas = {e["estado"]: e for e in cuerpo["linea_tiempo"]}
    assert etapas["cotizada"]["alcanzado"] and etapas["cotizada"]["responsable"] == "Santiago Guagalango"
    assert etapas["despachada"]["alcanzado"] and etapas["despachada"]["responsable"] == "Jorge Vela"
    assert not etapas["recibida"]["alcanzado"] and not etapas["instalada"]["alcanzado"]


def test_diferencia_en_el_despacho_exige_justificacion(api, db, h):
    c = _cotizacion(db)
    datos = {**TRAZABILIDAD, "items": _items_despacho(db, c, {"VAR1650": 350})}

    r = _despacho(api, h, c.id, datos)
    assert r.status_code == 422 and "justificación" in r.json()["detail"]
    assert db.get(Cotizacion, c.id).estado == EstadoCotizacion.COTIZADA

    r = _despacho(api, h, c.id, {**datos, "justificacion": "   "})
    assert r.status_code == 422, "una justificación en blanco no cuenta"

    cuerpo = _despachar(api, h, db, c, {"VAR1650": 350}, "Dos varillas con fallas de soldadura")
    var = next(i for i in cuerpo["despacho"]["items"] if i["codigo"] == "VAR1650")
    assert var["diferencia"] == -2 and cuerpo["despacho"]["con_diferencias"] is True


@pytest.mark.parametrize(
    "items_fn, motivo",
    [
        (lambda its: its[:-1], "falta un material"),
        (lambda its: its + its[:1], "material repetido"),
        (lambda its: its + [{"material_id": 999_999, "cantidad_despachada": 1}], "material ajeno"),
    ],
)
def test_el_despacho_debe_cubrir_exactamente_los_materiales_cotizados(api, db, h, items_fn, motivo):
    c = _cotizacion(db)
    r = _despacho(api, h, c.id, {**TRAZABILIDAD, "items": items_fn(_items_despacho(db, c))})
    assert r.status_code == 422, motivo


def test_trazabilidad_obligatoria_y_cantidades_no_negativas(api, db, h):
    c = _cotizacion(db)
    items = _items_despacho(db, c)
    assert _despacho(api, h, c.id, {**TRAZABILIDAD, "soldado_por": " ", "items": items}).status_code == 422
    sin_destino = {k: v for k, v in TRAZABILIDAD.items() if k != "destino"}
    assert _despacho(api, h, c.id, {**sin_destino, "items": items}).status_code == 422
    items[0]["cantidad_despachada"] = -1
    assert _despacho(api, h, c.id, {**TRAZABILIDAD, "items": items}).status_code == 422
    assert _despacho(api, h, c.id, {**TRAZABILIDAD, "items": []}).status_code == 422
    r = api.post(f"/api/validacion/cotizaciones/{c.id}/despacho", headers=h, data={"datos": "{no es json"})
    assert r.status_code == 422


def test_no_se_despacha_dos_veces(api, db, h):
    c = _cotizacion(db)
    _despachar(api, h, db, c)
    r = _despacho(api, h, c.id, {**TRAZABILIDAD, "items": _items_despacho(db, c)})
    assert r.status_code == 409 and "despachada" in r.json()["detail"]
    assert db.scalar(select(Despacho).where(Despacho.cotizacion_id == c.id)) is not None


def test_despacho_de_cotizacion_inexistente(api, h):
    r = _despacho(api, h, 999_999, {**TRAZABILIDAD, "items": [{"material_id": 1, "cantidad_despachada": 1}]})
    assert r.status_code == 404


# ─── Fotos del lote ─────────────────────────────────────────────────


def test_fotos_del_despacho_se_guardan_y_se_pueden_ver(api, db, h):
    c = _cotizacion(db)
    ids = _ids(db, c)
    datos = {
        **TRAZABILIDAD,
        "items": [
            {**i, "conteo_ia": 352 if i["material_id"] == ids["VAR1650"] else None} for i in _items_despacho(db, c)
        ],
        "fotos": [{"material_id": ids["VAR1650"], "conteo_ia": 200}, {"material_id": ids["VAR1650"], "conteo_ia": 152}],
    }
    r = _despacho(api, h, c.id, datos, [("lote-1.png", PNG), ("lote-2.jpg", JPG)])
    assert r.status_code == 201, r.text
    fotos = r.json()["despacho"]["fotos"]
    assert [(f["nombre_archivo"], f["conteo_ia"]) for f in fotos] == [("lote-1.png", 200), ("lote-2.jpg", 152)]
    var = next(i for i in r.json()["despacho"]["items"] if i["codigo"] == "VAR1650")
    assert var["conteo_ia"] == 352

    foto = api.get(f"/api/validacion/cotizaciones/{c.id}/fotos/{fotos[1]['id']}", headers=h)
    assert foto.status_code == 200 and foto.headers["content-type"] == "image/jpeg" and foto.content == JPG

    otra = _cotizacion(db, numero="CT-902-2026")
    assert api.get(f"/api/validacion/cotizaciones/{otra.id}/fotos/{fotos[1]['id']}", headers=h).status_code == 404


def test_fotos_invalidas_se_rechazan_sin_despachar(api, db, h):
    c = _cotizacion(db)
    ids = _ids(db, c)
    base = {**TRAZABILIDAD, "items": _items_despacho(db, c)}
    una = {**base, "fotos": [{"material_id": ids["VAR1650"]}]}

    assert _despacho(api, h, c.id, una, [("lote.pdf", PDF)]).status_code == 415
    assert _despacho(api, h, c.id, una, [("vacia.png", b"")]).status_code == 422
    assert _despacho(api, h, c.id, base, [("sin-datos.png", PNG)]).status_code == 422, "foto sin su material"
    ajena = {**base, "fotos": [{"material_id": 999_999}]}
    assert _despacho(api, h, c.id, ajena, [("lote.png", PNG)]).status_code == 422
    assert db.get(Cotizacion, c.id).estado == EstadoCotizacion.COTIZADA


def test_foto_de_mas_de_10_mb(api, db, h):
    c = _cotizacion(db)
    datos = {**TRAZABILIDAD, "items": _items_despacho(db, c), "fotos": [{"material_id": _ids(db, c)["LOG"]}]}
    grande = PNG + b"0" * servicio.TAMANO_MAXIMO_FOTO
    assert _despacho(api, h, c.id, datos, [("grande.png", grande)]).status_code == 413


# ─── Conteo con IA ──────────────────────────────────────────────────


def test_conteo_de_varillas_reenvia_la_foto_a_ia_service(api, db, h, monkeypatch):
    c = _cotizacion(db)
    enviado = {}

    def falso_post(url, files, headers, timeout):
        enviado.update(url=url, secreto=headers["X-Internal-Secret"], contenido=files["archivo"][1])
        return httpx.Response(200, json={"cantidad": 348, "confianza": 0.8, "advertencias": ["Borde izquierdo con sombra."]})

    monkeypatch.setattr("app.services.ia_service.httpx.post", falso_post)
    r = api.post(f"/api/validacion/cotizaciones/{c.id}/conteo", headers=h, files={"foto": ("lote.jpg", JPG, "image/jpeg")})
    assert r.status_code == 200, r.text
    assert r.json() == {"cantidad": 348, "confianza": 0.8, "advertencias": ["Borde izquierdo con sombra."]}
    assert enviado["url"].endswith("/api/varillas/contar") and enviado["secreto"] == "secreto-de-prueba"
    assert enviado["contenido"] == JPG
    assert db.get(Cotizacion, c.id).estado == EstadoCotizacion.COTIZADA, "contar no despacha"


def test_conteo_errores(api, db, h, monkeypatch):
    c = _cotizacion(db)
    ruta = f"/api/validacion/cotizaciones/{c.id}/conteo"
    assert api.post(ruta, headers=h, files={"foto": ("lote.pdf", PDF)}).status_code == 415

    monkeypatch.setattr("app.services.ia_service.httpx.post", lambda *a, **k: httpx.Response(503, json={"detail": "Falta la clave de Anthropic."}))
    r = api.post(ruta, headers=h, files={"foto": ("lote.png", PNG)})
    assert r.status_code == 503 and r.json()["detail"] == "Falta la clave de Anthropic."

    def caido(*a, **k):
        raise httpx.ConnectError("sin red")

    monkeypatch.setattr("app.services.ia_service.httpx.post", caido)
    assert api.post(ruta, headers=h, files={"foto": ("lote.png", PNG)}).status_code == 502

    monkeypatch.setattr(settings, "IA_SERVICE_SECRET", None)
    assert api.post(ruta, headers=h, files={"foto": ("lote.png", PNG)}).status_code == 503

    _despachar(api, h, db, c)
    assert api.post(ruta, headers=h, files={"foto": ("lote.png", PNG)}).status_code == 409


# ─── RF-15: recepción ───────────────────────────────────────────────


def test_recepcion_antes_del_despacho(api, db, h):
    c = _cotizacion(db)
    r = _recepcion(api, h, c.id, {"recibido_por": "Ing. Pérez", "items": _checklist_ok(c)})
    assert r.status_code == 409 and "cotizada" in r.json()["detail"]


def test_checklist_con_ok_diferencia_y_pendiente(api, db, h):
    c = _cotizacion(db)
    _despachar(api, h, db, c, {"VAR1650": 350}, "Dos varillas con fallas")
    ids = _ids(db, c)
    datos = {
        "recibido_por": "Ing. Pérez",
        "observaciones": "Se acuerda reposición en el próximo despacho.",
        "items": [
            {"material_id": ids["VAR1650"], "estado": "diferencia", "cantidad_recibida": 342, "observacion": "8 varillas dobladas en el transporte"},
            {"material_id": ids["VAR1350"], "estado": "ok"},
            {"material_id": ids["LOG"], "estado": "pendiente"},
        ],
    }
    r = _recepcion(api, h, c.id, datos, [("descarga.jpg", JPG)])
    assert r.status_code == 201, r.text
    cuerpo = r.json()
    assert cuerpo["estado"] == "recibida"
    rec = cuerpo["recepcion"]
    assert (rec["revisados"], rec["diferencias"], rec["pendientes"]) == (2, 1, 1)
    por_codigo = {i["codigo"]: i for i in rec["items"]}
    # Se compara contra lo despachado (350), no contra lo cotizado (352)
    assert por_codigo["VAR1650"]["cantidad_esperada"] == 350 and por_codigo["VAR1650"]["diferencia"] == -8
    assert por_codigo["VAR1350"]["cantidad_recibida"] == 374 and por_codigo["VAR1350"]["diferencia"] == 0
    assert por_codigo["LOG"]["cantidad_recibida"] is None and por_codigo["LOG"]["diferencia"] is None
    assert [f["nombre_archivo"] for f in rec["fotos"]] == ["descarga.jpg"]
    assert next(e for e in cuerpo["linea_tiempo"] if e["estado"] == "recibida")["responsable"] == "Ing. Pérez"


@pytest.mark.parametrize(
    "item, motivo",
    [
        ({"estado": "diferencia", "cantidad_recibida": 300}, "diferencia sin observación"),
        ({"estado": "diferencia", "observacion": "faltan"}, "diferencia sin cantidad"),
        ({"estado": "diferencia", "cantidad_recibida": 352, "observacion": "igual"}, "diferencia que no lo es"),
        ({"estado": "ok", "cantidad_recibida": 300}, "OK con otra cantidad"),
        ({"estado": "pendiente", "cantidad_recibida": 10}, "pendiente con cantidad"),
        ({"estado": "perdido"}, "estado desconocido"),
    ],
)
def test_checklist_incoherente_se_rechaza(api, db, h, item, motivo):
    c = _cotizacion(db)
    _despachar(api, h, db, c)
    ids = _ids(db, c)
    items = [{"material_id": i, "estado": "ok"} for i in ids.values() if i != ids["VAR1650"]]
    items.append({"material_id": ids["VAR1650"], **item})
    r = _recepcion(api, h, c.id, {"recibido_por": "Ing. Pérez", "items": items})
    assert r.status_code == 422, motivo
    assert db.get(Cotizacion, c.id).estado == EstadoCotizacion.DESPACHADA


def test_la_recepcion_confirmada_no_se_modifica(api, db, h):
    c = _cotizacion(db)
    _despachar(api, h, db, c)
    datos = {"recibido_por": "Ing. Pérez", "items": _checklist_ok(c)}
    assert _recepcion(api, h, c.id, datos).status_code == 201
    assert _recepcion(api, h, c.id, datos).status_code == 409


def test_la_base_rechaza_un_item_de_recepcion_incoherente(api, db, h):
    """El CHECK protege aunque alguien escriba sin pasar por la API."""
    c = _cotizacion(db)
    _despachar(api, h, db, c)
    _recepcion(api, h, c.id, {"recibido_por": "Ing. Pérez", "items": _checklist_ok(c)})
    item = db.scalar(select(ItemRecepcion).limit(1))
    item.estado, item.observacion = "diferencia", None
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


# ─── RF-16: instalación y línea de tiempo ───────────────────────────


def test_ciclo_completo_hasta_instalada(api, db, h):
    c = _cotizacion(db)
    ruta = f"/api/validacion/cotizaciones/{c.id}/instalacion"
    assert api.post(ruta, headers=h).status_code == 409, "no se instala lo que no se recibió"

    _despachar(api, h, db, c)
    assert api.post(ruta, headers=h).status_code == 409
    _recepcion(api, h, c.id, {"recibido_por": "Ing. Pérez", "items": _checklist_ok(c)})

    r = api.post(ruta, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "instalada"
    etapas = r.json()["linea_tiempo"]
    assert [e["estado"] for e in etapas] == ["cotizada", "despachada", "recibida", "instalada"]
    assert all(e["alcanzado"] and e["fecha"] for e in etapas)
    fechas = [datetime.fromisoformat(e["fecha"]) for e in etapas]
    assert fechas == sorted(fechas)
    assert api.post(ruta, headers=h).status_code == 409, "no se instala dos veces"


def test_la_base_exige_fecha_de_instalacion_coherente(db):
    c = _cotizacion(db)
    c.estado = EstadoCotizacion.INSTALADA
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


def test_consultar_seguimiento(api, db, h):
    c = _cotizacion(db)
    r = api.get(f"/api/validacion/cotizaciones/{c.id}", headers=h)
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["numero_proforma"] == "CT-901-2026" and cuerpo["despacho"] is None and cuerpo["recepcion"] is None
    assert [(m["codigo"], m["cantidad"]) for m in cuerpo["materiales"]] == [("LOG", 1), ("VAR1350", 374), ("VAR1650", 352)]
    assert api.get("/api/validacion/cotizaciones/999999", headers=h).status_code == 404


# ─── Listas ─────────────────────────────────────────────────────────


def test_listas_de_despacho_y_recepcion(api, db, h):
    por_despachar = _cotizacion(db, numero="CT-911-2026")
    despachada = _cotizacion(db, numero="CT-912-2026")
    recibida = _cotizacion(db, numero="CT-913-2026")
    instalada = _cotizacion(db, numero="CT-914-2026")
    for c in (despachada, recibida, instalada):
        _despachar(api, h, db, c)
    for c in (recibida, instalada):
        _recepcion(api, h, c.id, {"recibido_por": "Ing. Pérez", "items": _checklist_ok(c)})
    api.post(f"/api/validacion/cotizaciones/{instalada.id}/instalacion", headers=h)

    despacho = {f["numero_proforma"]: f for f in api.get("/api/validacion/despachos/pendientes", headers=h).json()}
    assert {"CT-911-2026", "CT-912-2026"} <= set(despacho) and not {"CT-913-2026", "CT-914-2026"} & set(despacho)
    assert despacho["CT-911-2026"]["fecha_despacho"] is None and despacho["CT-912-2026"]["fecha_despacho"]

    recepcion = {f["numero_proforma"] for f in api.get("/api/validacion/recepciones/pendientes", headers=h).json()}
    assert {"CT-912-2026", "CT-913-2026"} <= recepcion and not {"CT-911-2026", "CT-914-2026"} & recepcion

    buscados = api.get("/api/validacion/despachos/pendientes", headers=h, params={"buscar": "ct-911"}).json()
    assert [f["numero_proforma"] for f in buscados] == ["CT-911-2026"]
    assert api.get("/api/validacion/despachos/pendientes", headers=h, params={"buscar": "100%_"}).json() == []
    assert por_despachar.id in {f["cotizacion_id"] for f in despacho.values()}


# ─── Permisos ───────────────────────────────────────────────────────


def test_permisos_de_cada_opcion(api, db, h):
    c = _cotizacion(db)
    produccion = _cabecera(crear_usuario(db, perfil=perfil_produccion(db)))
    solo_recepcion = _cabecera(crear_usuario(db, perfil=perfil_personalizado(db, Permiso.RECEPCION)))
    solo_historial = _cabecera(crear_usuario(db, perfil=perfil_personalizado(db, Permiso.HISTORIAL)))
    solo_clientes = _cabecera(crear_usuario(db, perfil=perfil_personalizado(db, Permiso.CLIENTES)))
    datos = {**TRAZABILIDAD, "items": _items_despacho(db, c)}

    # El Personal de Producción despacha y recibe por defecto
    assert api.get("/api/validacion/despachos/pendientes", headers=produccion).status_code == 200
    assert api.get("/api/validacion/recepciones/pendientes", headers=produccion).status_code == 200

    assert _despacho(api, solo_recepcion, c.id, datos).status_code == 403
    assert _despacho(api, solo_historial, c.id, datos).status_code == 403
    assert api.get("/api/validacion/despachos/pendientes", headers=solo_historial).status_code == 403
    assert api.post(f"/api/validacion/cotizaciones/{c.id}/conteo", headers=solo_recepcion, files={"foto": ("a.png", PNG)}).status_code == 403
    assert _despacho(api, produccion, c.id, datos).status_code == 201

    assert _recepcion(api, solo_historial, c.id, {"recibido_por": "X", "items": _checklist_ok(c)}).status_code == 403
    assert _recepcion(api, solo_recepcion, c.id, {"recibido_por": "X", "items": _checklist_ok(c)}).status_code == 201

    # El seguimiento y la instalación también los usa quien consulta el historial
    assert api.get(f"/api/validacion/cotizaciones/{c.id}", headers=solo_historial).status_code == 200
    assert api.get(f"/api/validacion/cotizaciones/{c.id}", headers=solo_clientes).status_code == 403
    assert api.post(f"/api/validacion/cotizaciones/{c.id}/instalacion", headers=solo_clientes).status_code == 403
    assert api.post(f"/api/validacion/cotizaciones/{c.id}/instalacion", headers=solo_historial).status_code == 200


# ─── Tablero (RF-13) ────────────────────────────────────────────────


def test_tablero_cuenta_lotes_despachados_y_recibidos(api, db, h):
    antes = obtener_tablero(db).resumen
    a, b = _cotizacion(db, numero="CT-921-2026"), _cotizacion(db, numero="CT-922-2026")
    _despachar(api, h, db, a)
    _despachar(api, h, db, b)
    _recepcion(api, h, b.id, {"recibido_por": "Ing. Pérez", "items": _checklist_ok(b)})
    despues = obtener_tablero(db).resumen
    assert despues.lotes_despachados - antes.lotes_despachados == 2
    assert despues.lotes_recibidos - antes.lotes_recibidos == 1


# ─── Concurrencia ───────────────────────────────────────────────────


def test_dos_despachos_simultaneos_solo_uno_gana(_engine):
    """
    La segunda confirmación espera el bloqueo de la fila y, al obtenerlo,
    encuentra la propuesta ya despachada: 409, no un segundo despacho.
    """
    with Session(_engine) as preparar:
        c = _cotizacion(preparar, numero=f"CT-99{int(time.time()) % 10}-2026")
        usuario = crear_usuario(preparar)
        preparar.commit()
        ids = {"cotizacion": c.id, "usuario": usuario.id, "perfil": usuario.perfil_id,
               "creador": c.usuario_id, "materiales": [m.material_id for m in c.materiales]}
        cantidades = {m.material_id: m.cantidad for m in c.materiales}

    from app.schemas.validacion import DespachoCrear

    datos = DespachoCrear(
        **TRAZABILIDAD,
        items=[{"material_id": mid, "cantidad_despachada": cant} for mid, cant in cantidades.items()],
    )
    primera, segunda = Session(_engine), Session(_engine)
    resultado = {}
    try:
        servicio._bloquear(primera, ids["cotizacion"], EstadoCotizacion.COTIZADA, "despachar")

        def segundo_despacho():
            try:
                servicio.registrar_despacho(segunda, ids["cotizacion"], datos, [], segunda.get(Usuario, ids["usuario"]))
                resultado["segunda"] = "despachó"
            except servicio.EstadoNoPermitido:
                resultado["segunda"] = "409"

        hilo = threading.Thread(target=segundo_despacho)
        hilo.start()
        time.sleep(0.5)
        assert hilo.is_alive(), "la segunda confirmación debía esperar el bloqueo"
        servicio.registrar_despacho(primera, ids["cotizacion"], datos, [], primera.get(Usuario, ids["usuario"]))
        hilo.join(timeout=10)
        assert resultado == {"segunda": "409"}
    finally:
        primera.close()
        if "hilo" in locals():
            hilo.join(timeout=10)
        segunda.close()
        with Session(_engine) as limpiar:
            # Por el ORM: borra en cascada los materiales cotizados y el despacho
            limpiar.delete(limpiar.get(Cotizacion, ids["cotizacion"]))
            limpiar.flush()
            limpiar.execute(delete(Usuario).where(Usuario.id.in_([ids["usuario"], ids["creador"]])))
            limpiar.execute(delete(Material).where(Material.id.in_(ids["materiales"])))
            if limpiar.scalar(select(Usuario.id).where(Usuario.perfil_id == ids["perfil"]).limit(1)) is None:
                limpiar.execute(delete(Perfil).where(Perfil.id == ids["perfil"]))
            limpiar.commit()
