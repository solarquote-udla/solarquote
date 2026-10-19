"""
Boceto del cliente (RF-04) y su confirmación (RF-05).

ia-service y calc-service se simulan: lo que se prueba aquí es qué se les
manda, qué se guarda y qué reglas aplica la API principal. La lectura del
archivo en sí se prueba en ia-service.
"""

import threading
import time
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.permisos import Permiso
from app.core.security import hash_password
from app.models.boceto import BloqueBoceto, Boceto
from app.models.cliente import Cliente, TipoIdentificacion
from app.models.cotizacion import Cotizacion
from app.models.perfil import Perfil
from app.models.usuario import Usuario
from app.models.proyecto import EstadoProyecto, Proyecto
from app.services import boceto as servicio
from app.services.confirmacion import items_del_boceto
from tests.fabricas import crear_usuario, perfil_personalizado
from tests.test_confirmacion import _sembrar_precios, calc  # noqa: F401
from tests.test_varios_inversores import _cabecera, api, equipo, guardar, h, inversor  # noqa: F401

ANIO = datetime.now(timezone(timedelta(hours=-5))).year
PDF = b"%PDF-1.7\n" + b"0" * 200

# Lo que devuelve ia-service para el boceto de San Pablo, simplificado
LECTURA = {
    "formato": "pdf",
    "metodo": "ia",
    "bloques": [
        {"etiqueta": "A", "paneles_largo": 4, "paneles_ancho": 24, "repeticiones": 30, "orientacion": "vertical", "confianza": 0.9},
        {"etiqueta": "B", "paneles_largo": 4, "paneles_ancho": 10, "repeticiones": 2, "orientacion": "vertical", "confianza": 0.6},
    ],
    "advertencias": ["Dos bloques del borde sur están tapados por un rótulo."],
}


@pytest.fixture(autouse=True)
def secreto(monkeypatch):
    monkeypatch.setattr(settings, "IA_SERVICE_SECRET", "secreto-ia")


@pytest.fixture
def ia(monkeypatch, calc):  # noqa: F811 — calc simula calc-service; ia se monta encima
    """ia-service simulado. `ia["respuesta"]` cambia lo que devuelve."""
    estado: dict = {"respuesta": httpx.Response(200, json=LECTURA), "llamadas": []}
    siguiente = httpx.post

    def post_falso(url, **kwargs):
        if url.endswith("/api/bocetos/interpretar"):
            estado["llamadas"].append({"url": url, **kwargs})
            respuesta = estado["respuesta"]
            if isinstance(respuesta, Exception):
                raise respuesta
            return respuesta
        return siguiente(url, **kwargs)

    monkeypatch.setattr(httpx, "post", post_falso)
    return estado


@pytest.fixture
def pid(api, db, h) -> int:  # noqa: F811
    """Proyecto sin terreno ni equipo: lo normal cuando el cliente ya trae su diseño."""
    cliente = Cliente(nombre="Cliente bocetos", tipo_identificacion=TipoIdentificacion.RUC, identificacion="1710034065001")
    db.add(cliente)
    db.flush()
    r = api.post(
        "/api/proyectos",
        headers=h,
        json={"nombre": "San Pablo", "cliente_id": cliente.id, "ubicacion": None, "latitud": None, "longitud": None, "notas": None},
    )
    return r.json()["id"]


def subir(api, h, pid, contenido: bytes = PDF, nombre: str = "Planta San Pablo.pdf"):
    return api.post(f"/api/proyectos/{pid}/boceto", headers=h, files={"archivo": (nombre, contenido, "application/pdf")})


def editar(api, h, pid, *bloques: dict):
    return api.put(f"/api/proyectos/{pid}/boceto/bloques", headers=h, json={"bloques": list(bloques)})


def tipo(L: int, A: int, B: int, **extra) -> dict:
    return {"etiqueta": extra.pop("etiqueta", None), "paneles_largo": L, "paneles_ancho": A, "repeticiones": B, "orientacion": "vertical", **extra}


def cotizar(api, h, pid, **cuerpo):
    return api.post(f"/api/proyectos/{pid}/boceto/cotizacion", headers=h, json=cuerpo)


# ─── Carga (RF-04) ──────────────────────────────────────────────────


def test_cargar_guarda_el_archivo_y_los_bloques(api, db, h, pid, ia):
    r = subir(api, h, pid)
    assert r.status_code == 201, r.text
    boceto = r.json()

    (llamada,) = ia["llamadas"]
    assert llamada["headers"] == {"X-Internal-Secret": "secreto-ia"}
    assert llamada["files"]["archivo"][:2] == ("Planta San Pablo.pdf", PDF)

    assert boceto["nombre_archivo"] == "Planta San Pablo.pdf"
    assert (boceto["formato"], boceto["metodo"], boceto["tamano_bytes"]) == ("pdf", "ia", len(PDF))
    assert [(b["paneles_largo"], b["paneles_ancho"], b["repeticiones"], b["paneles"]) for b in boceto["bloques"]] == [
        (4, 24, 30, 2880),
        (4, 10, 2, 80),
    ]
    assert boceto["total_paneles"] == 2960
    assert boceto["advertencias"] == LECTURA["advertencias"]
    # Sin equipo: proporción con el panel de referencia y sin potencia
    assert boceto["panel"] == {"largo_mm": 2278, "ancho_mm": 1134, "potencia_wp": None, "origen": "referencia"}
    assert boceto["potencia_kwp"] is None
    # 4 × 24 queda en proporción (2,99); 4 × 10 no (1,24)
    assert [b["en_proporcion"] for b in boceto["bloques"]] == [True, False]

    proyecto = api.get(f"/api/proyectos/{pid}", headers=h).json()
    assert proyecto["tiene_boceto"] is True
    assert proyecto["estado"] == "en_diseno"
    assert api.get(f"/api/proyectos/{pid}/boceto", headers=h).json() == boceto


def test_con_equipo_usa_su_panel_y_calcula_la_potencia(api, h, pid, ia):
    guardar(api, h, pid, equipo(inversor()))
    boceto = subir(api, h, pid).json()
    assert boceto["panel"]["origen"] == "equipo"
    assert boceto["potencia_kwp"] == round(2960 * 0.58, 2)


def test_descargar_el_archivo_original(api, h, pid, ia):
    subir(api, h, pid, nombre="Planta Ñandú.pdf")
    r = api.get(f"/api/proyectos/{pid}/boceto/archivo", headers=h)
    assert r.status_code == 200
    assert r.content == PDF
    assert r.headers["content-type"] == "application/pdf"
    assert "Planta%20%C3%91and%C3%BA.pdf" in r.headers["content-disposition"]


def test_un_boceto_nuevo_reemplaza_al_anterior(api, db, h, pid, ia):
    subir(api, h, pid)
    ia["respuesta"] = httpx.Response(200, json={**LECTURA, "formato": "dxf", "metodo": "dxf", "bloques": LECTURA["bloques"][:1]})
    r = subir(api, h, pid, b"0\nSECTION", "planta.dxf")
    assert r.status_code == 201
    assert len(r.json()["bloques"]) == 1
    assert db.query(Boceto).filter(Boceto.proyecto_id == pid).count() == 1


@pytest.mark.parametrize(
    ("status", "detalle"),
    [
        (415, "El archivo es un DWG. Guárdalo como DXF."),
        (422, "No se encontraron paneles en el DXF."),
        (503, "El análisis con IA no está configurado todavía."),
    ],
)
def test_errores_de_ia_service_se_reenvian_con_su_mensaje(api, db, h, pid, ia, status, detalle):
    ia["respuesta"] = httpx.Response(status, json={"detail": detalle})
    r = subir(api, h, pid)
    assert (r.status_code, r.json()["detail"]) == (status, detalle)
    assert db.query(Boceto).count() == 0


def test_error_interno_de_ia_service_no_se_reenvia(api, h, pid, ia):
    ia["respuesta"] = httpx.Response(500, text="Traceback: KeyError en /app/services/dxf.py")
    r = subir(api, h, pid)
    assert r.status_code == 502
    assert "Traceback" not in r.json()["detail"]


def test_ia_service_caido_o_lento(api, h, pid, ia):
    ia["respuesta"] = httpx.ConnectError("sin conexión")
    assert subir(api, h, pid).status_code == 502
    ia["respuesta"] = httpx.ReadTimeout("lento")
    assert subir(api, h, pid).status_code == 504


def test_respuesta_invalida_de_ia_service(api, h, pid, ia):
    ia["respuesta"] = httpx.Response(200, json={"formato": "pdf", "metodo": "ia", "bloques": [{"paneles_largo": 0}]})
    assert subir(api, h, pid).status_code == 502


def test_un_error_no_borra_el_boceto_anterior(api, h, pid, ia):
    subir(api, h, pid)
    ia["respuesta"] = httpx.Response(503, json={"detail": "sin clave"})
    assert subir(api, h, pid).status_code == 503
    assert len(api.get(f"/api/proyectos/{pid}/boceto", headers=h).json()["bloques"]) == 2


def test_sin_secreto_configurado_es_503_sin_llamar(api, h, pid, ia, monkeypatch):
    monkeypatch.setattr(settings, "IA_SERVICE_SECRET", None)
    r = subir(api, h, pid)
    assert r.status_code == 503
    assert ia["llamadas"] == []


def test_archivo_vacio_o_demasiado_grande(api, h, pid, ia, monkeypatch):
    assert subir(api, h, pid, b"").status_code == 422
    monkeypatch.setattr(servicio, "TAMANO_MAXIMO_BYTES", 100)
    assert subir(api, h, pid).status_code == 413
    assert ia["llamadas"] == []


def test_sin_boceto_es_404(api, h, pid):
    assert api.get(f"/api/proyectos/{pid}/boceto", headers=h).status_code == 404
    assert api.get(f"/api/proyectos/{pid}/boceto/archivo", headers=h).status_code == 404
    assert api.get("/api/proyectos/999999/boceto", headers=h).status_code == 404


def test_requiere_permiso_de_cargar_boceto(api, db, pid, ia):
    solo_layout = _cabecera(crear_usuario(db, perfil=perfil_personalizado(db, Permiso.GENERAR_LAYOUT)))
    assert subir(api, solo_layout, pid).status_code == 403
    solo_boceto = _cabecera(crear_usuario(db, perfil=perfil_personalizado(db, Permiso.CARGAR_BOCETO)))
    assert subir(api, solo_boceto, pid).status_code == 201


# ─── Corrección en la confirmación (RF-05) ──────────────────────────


def test_editar_reemplaza_los_tipos_y_conserva_la_confianza_de_los_que_no_cambiaron(api, h, pid, ia):
    subir(api, h, pid)
    r = editar(api, h, pid, tipo(4, 24, 30, etiqueta="A"), tipo(4, 12, 3, etiqueta="B"), tipo(2, 8, 1))
    assert r.status_code == 200, r.text
    boceto = r.json()
    assert [(b["paneles_ancho"], b["repeticiones"], b["confianza"]) for b in boceto["bloques"]] == [
        (24, 30, 0.9),
        (12, 3, None),
        (8, 1, None),
    ]
    assert boceto["ediciones_manuales"] == 1

    # Guardar lo mismo no cuenta como edición
    assert editar(api, h, pid, tipo(4, 24, 30, etiqueta="A"), tipo(4, 12, 3, etiqueta="B"), tipo(2, 8, 1)).json()["ediciones_manuales"] == 1


@pytest.mark.parametrize(
    "bloque",
    [tipo(3, 24, 1), tipo(0, 24, 1), tipo(4, 0, 1), tipo(4, 24, 0), tipo(4, 501, 1), tipo(4, 24, 1, orientacion="diagonal")],
)
def test_editar_valida_cada_tipo(api, h, pid, ia, bloque):
    subir(api, h, pid)
    assert editar(api, h, pid, bloque).status_code == 422


def test_editar_sin_tipos_o_sin_boceto(api, h, pid, ia):
    assert editar(api, h, pid, tipo(4, 24, 1)).status_code == 409
    subir(api, h, pid)
    assert editar(api, h, pid).status_code == 422


# ─── Cotización (RF-05 → RF-06) ─────────────────────────────────────


def test_confirmar_emite_la_cotizacion_con_los_tipos_del_boceto(api, db, h, pid, ia):
    _sembrar_precios(db)
    subir(api, h, pid)
    r = cotizar(api, h, pid, acepta_fuera_de_proporcion=True)
    assert r.status_code == 201, r.text
    emitida = r.json()
    assert emitida["numero_proforma"] == f"CT-001-{ANIO}"

    cotizacion = db.get(Cotizacion, emitida["id"])
    assert [(i.paneles_largo, i.paneles_ancho, i.bloques) for i in cotizacion.items] == [(4, 24, 30), (4, 10, 2)]
    assert cotizacion.total_paneles == 2960
    assert cotizacion.potencia_kwp is None  # sin panel configurado no se conoce

    proyecto = api.get(f"/api/proyectos/{pid}", headers=h).json()
    assert proyecto["estado"] == "cotizado"
    assert proyecto["cotizacion_id"] == emitida["id"]


def test_fuera_de_proporcion_exige_aceptarlos(api, db, h, pid, ia):
    _sembrar_precios(db)
    subir(api, h, pid)
    r = cotizar(api, h, pid)
    assert r.status_code == 409
    assert "2 bloque(s)" in r.json()["detail"]  # el tipo B se repite 2 veces
    assert db.query(Cotizacion).count() == 0


def test_l_impar_leido_no_se_cotiza(api, db, h, pid, ia):
    _sembrar_precios(db)
    ia["respuesta"] = httpx.Response(200, json={**LECTURA, "bloques": [{**LECTURA["bloques"][0], "paneles_largo": 3}]})
    subir(api, h, pid)
    r = cotizar(api, h, pid, acepta_fuera_de_proporcion=True)
    assert r.status_code == 409
    assert "L impar (3)" in r.json()["detail"]


def test_boceto_sin_bloques_o_sin_boceto_no_se_cotiza(api, db, h, pid, ia):
    _sembrar_precios(db)
    assert "Carga el boceto" in cotizar(api, h, pid).json()["detail"]
    ia["respuesta"] = httpx.Response(200, json={**LECTURA, "bloques": []})
    subir(api, h, pid)
    assert "no tiene bloques" in cotizar(api, h, pid).json()["detail"]


def test_cotizado_queda_congelado(api, db, h, pid, ia):
    _sembrar_precios(db)
    subir(api, h, pid)
    assert cotizar(api, h, pid, acepta_fuera_de_proporcion=True).status_code == 201

    assert cotizar(api, h, pid, acepta_fuera_de_proporcion=True).status_code == 409
    assert subir(api, h, pid).status_code == 409
    assert editar(api, h, pid, tipo(4, 24, 1)).status_code == 409
    # El archivo sigue disponible como respaldo de la proforma
    assert api.get(f"/api/proyectos/{pid}/boceto/archivo", headers=h).status_code == 200


def test_un_proyecto_cotizado_por_layout_no_se_vuelve_a_cotizar_por_boceto(api, db, h, pid, ia):
    _sembrar_precios(db)
    subir(api, h, pid)
    db.get(Proyecto, pid).estado = EstadoProyecto.COTIZADO
    db.flush()
    assert cotizar(api, h, pid, acepta_fuera_de_proporcion=True).status_code == 409


def test_items_suman_tipos_de_igual_tamano_y_distinta_orientacion():
    boceto = Boceto(bloques=[])
    boceto.bloques = [
        BloqueBoceto(paneles_largo=4, paneles_ancho=10, repeticiones=2, orientacion="vertical"),
        BloqueBoceto(paneles_largo=4, paneles_ancho=24, repeticiones=5, orientacion="vertical"),
        BloqueBoceto(paneles_largo=4, paneles_ancho=10, repeticiones=4, orientacion="horizontal"),
    ]
    assert [(i.paneles_largo, i.paneles_ancho, i.bloques) for i in items_del_boceto(boceto)] == [(4, 10, 6), (4, 24, 5)]


def test_precio_faltante_no_cotiza(api, db, h, pid, ia):
    _sembrar_precios(db, sin="VAR1650")
    subir(api, h, pid)
    assert cotizar(api, h, pid, acepta_fuera_de_proporcion=True).status_code == 422
    assert db.query(Cotizacion).count() == 0



# ─── Revisión del PR #44 (Esteban) ──────────────────────────────────


def test_etiqueta_larga_se_recorta_y_no_descarta_la_lectura(api, h, pid, ia):
    larga = "Bloque tipo A de la segunda etapa norte"  # 39 caracteres
    ia["respuesta"] = httpx.Response(200, json={**LECTURA, "bloques": [{**LECTURA["bloques"][0], "etiqueta": larga}]})
    r = subir(api, h, pid)
    assert r.status_code == 201, r.text
    assert r.json()["bloques"][0]["etiqueta"] == larga[:20].rstrip()


def test_si_se_cotiza_mientras_se_lee_el_boceto_no_se_guarda(api, db, h, pid, monkeypatch):
    """La lectura tarda: se vuelve a verificar el estado con la fila bloqueada."""

    def lectura_lenta(nombre, contenido):
        db.get(Proyecto, pid).estado = EstadoProyecto.COTIZADO  # otra pestaña cotizó mientras tanto
        db.flush()
        return LECTURA

    monkeypatch.setattr(servicio, "interpretar_boceto", lectura_lenta)
    assert subir(api, h, pid).status_code == 409
    assert db.query(Boceto).count() == 0


def test_dos_cargas_simultaneas_se_ordenan_y_gana_la_ultima(_engine, monkeypatch):
    """
    Sin el bloqueo, las dos cargas insertan un boceto para el mismo
    proyecto y una choca contra la unicidad: un 500. Con FOR UPDATE, la
    segunda espera a la primera y la reemplaza.
    """
    monkeypatch.setattr(servicio, "interpretar_boceto", lambda nombre, contenido: LECTURA)

    with Session(_engine) as preparar:
        perfil = Perfil(nombre="Gerente bocetos", clave="gerente_bocetos_carrera", acceso_total=True)
        preparar.add(perfil)
        preparar.flush()
        usuario = Usuario(nombre="U", email="bocetos-carrera@example.com", password_hash=hash_password("Clave1234"), perfil_id=perfil.id)
        cliente = Cliente(nombre="Carrera", tipo_identificacion=TipoIdentificacion.RUC, identificacion="1710034065001")
        preparar.add_all([usuario, cliente])
        preparar.flush()
        proyecto = Proyecto(nombre="Carrera", cliente_id=cliente.id, usuario_id=usuario.id)
        preparar.add(proyecto)
        preparar.commit()
        ids = {"perfil": perfil.id, "usuario": usuario.id, "cliente": cliente.id, "proyecto": proyecto.id}

    resultado: dict[str, object] = {}
    primera = Session(_engine)
    segunda = Session(_engine)
    try:
        # La primera carga ya tiene la fila bloqueada y está guardando
        servicio._bloquear_proyecto(primera, ids["proyecto"])

        def segunda_carga():
            try:
                p = segunda.get(Proyecto, ids["proyecto"])
                u = segunda.get(Usuario, ids["usuario"])
                resultado["boceto"] = servicio.cargar_boceto(segunda, p, u, "segunda.pdf", PDF).nombre_archivo
            except Exception as exc:  # noqa: BLE001 — se reporta en la aserción
                resultado["error"] = repr(exc)
                segunda.rollback()

        hilo = threading.Thread(target=segunda_carga)
        hilo.start()
        time.sleep(0.5)
        assert hilo.is_alive(), "la segunda carga debía esperar el bloqueo"

        primera.add(
            Boceto(
                proyecto_id=ids["proyecto"], usuario_id=ids["usuario"], nombre_archivo="primera.pdf", formato="pdf",
                tamano_bytes=len(PDF), contenido=PDF, metodo="ia", advertencias=[],
            )
        )
        primera.commit()
        hilo.join(timeout=10)

        assert resultado == {"boceto": "segunda.pdf"}
        with Session(_engine) as revisar:
            assert [b.nombre_archivo for b in revisar.query(Boceto).filter(Boceto.proyecto_id == ids["proyecto"])] == ["segunda.pdf"]
    finally:
        primera.rollback()
        primera.close()
        if "hilo" in locals():
            hilo.join(timeout=10)
        segunda.close()
        with Session(_engine) as limpiar:
            limpiar.execute(delete(Proyecto).where(Proyecto.id == ids["proyecto"]))
            limpiar.execute(delete(Cliente).where(Cliente.id == ids["cliente"]))
            limpiar.execute(delete(Usuario).where(Usuario.id == ids["usuario"]))
            limpiar.execute(delete(Perfil).where(Perfil.id == ids["perfil"]))
            limpiar.commit()
