"""
Avance del proyecto en el asistente (tiene_terreno, tiene_equipo,
tiene_layout). El Historial lo usa para retomar cada proyecto en el paso
que le falta: el estado "en diseño" no distingue si falta el equipo o el
layout (revisión del PR #34).
"""

import pytest
from sqlalchemy import event
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import crear_access_token
from app.main import app
from app.models.cliente import Cliente, TipoIdentificacion
from tests.fabricas import crear_usuario

EQUIPO = {
    "panel": {"marca": "Canadian Solar", "modelo": "CS6W-580TB-AG", "potencia_wp": 580, "largo_mm": 2278, "ancho_mm": 1134, "voc_v": 52.2, "vmp_v": 43.1},
    "angulo_montaje": 15,
    "inversor": {"marca": "Huawei", "modelo": "Ejemplo", "potencia_kw": 160, "vmax_v": 1500, "vmin_v": 500, "mppts": 9, "strings_por_mppt": 2},
}


@pytest.fixture
def api(db: Session):
    app.dependency_overrides[get_db] = lambda: db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_el_avance_distingue_terreno_equipo_y_layout(api, db):
    usuario = crear_usuario(db)
    cliente = Cliente(nombre="Cliente avance", tipo_identificacion=TipoIdentificacion.RUC, identificacion="1710034065001")
    db.add(cliente)
    db.flush()
    h = {"Authorization": f"Bearer {crear_access_token(usuario_id=usuario.id, version=usuario.version_token)}"}

    pid = api.post(
        "/api/proyectos",
        headers=h,
        json={"nombre": "Avance", "cliente_id": cliente.id, "ubicacion": None, "latitud": 0.2, "longitud": None, "notas": None},
    ).json()["id"]

    def avance():
        p = api.get(f"/api/proyectos/{pid}", headers=h).json()
        listado = next(x for x in api.get("/api/proyectos", headers=h).json() if x["id"] == pid)
        assert (p["tiene_terreno"], p["tiene_equipo"], p["tiene_layout"]) == (
            listado["tiene_terreno"], listado["tiene_equipo"], listado["tiene_layout"],
        )
        return p["tiene_terreno"], p["tiene_equipo"], p["tiene_layout"], p["estado"]

    assert avance() == (False, False, False, "borrador")

    api.post(f"/api/proyectos/{pid}/terreno", headers=h, json={"vertices": [[0, 0], [60, 0], [60, 40], [0, 40]], "orientacion_norte": 0, "notas": None, "caminos": []})
    assert avance() == (True, False, False, "en_diseno")

    assert api.put(f"/api/proyectos/{pid}/equipo", headers=h, json=EQUIPO).status_code == 200
    # Mismo estado que antes: por eso el estado no sirve para elegir el paso
    assert avance() == (True, True, False, "en_diseno")

    generado = api.post(f"/api/proyectos/{pid}/layout", headers=h, json={"paneles_largo": 4, "pasillo_m": 2, "tolerancia_proporcion": 0.2, "capacidad_deseada_kwp": None})
    assert generado.status_code == 200
    assert avance()[:3] == (True, True, True)


def test_el_avance_se_resuelve_en_una_sola_consulta(db):
    from app.services.proyecto import avance_de

    consultas: list[str] = []

    def anotar(conn, cursor, sentencia, *_):
        if sentencia.lstrip().upper().startswith("SELECT"):
            consultas.append(sentencia)

    conexion = db.connection()
    event.listen(conexion, "before_cursor_execute", anotar)
    try:
        avance_de(db, [1, 2, 3])
    finally:
        event.remove(conexion, "before_cursor_execute", anotar)
    assert len(consultas) == 1
