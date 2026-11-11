"""
A mínimo del layout por la API (SQ-170): se aplica al generar, se guarda
con los demás parámetros y se valida.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import crear_access_token
from app.main import app
from app.models.cliente import Cliente, TipoIdentificacion
from tests.fabricas import crear_usuario
from tests.test_proyecto_avance import EQUIPO

PARAMETROS = {"paneles_largo": 4, "pasillo_m": 2, "tolerancia_proporcion": 0.2, "capacidad_deseada_kwp": None}


@pytest.fixture
def api(db: Session):
    app.dependency_overrides[get_db] = lambda: db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def proyecto(api, db):
    """Proyecto de 100 × 60 m con panel plano: sin mínimo deja 9 bloques de 4 × 1."""
    usuario = crear_usuario(db)
    cliente = Cliente(nombre="Cliente A mínimo", tipo_identificacion=TipoIdentificacion.RUC, identificacion="1710034065001")
    db.add(cliente)
    db.flush()
    h = {"Authorization": f"Bearer {crear_access_token(usuario_id=usuario.id, version=usuario.version_token)}"}
    pid = api.post(
        "/api/proyectos",
        headers=h,
        json={"nombre": "A mínimo", "cliente_id": cliente.id, "ubicacion": None, "latitud": None, "longitud": None, "notas": None},
    ).json()["id"]
    api.post(
        f"/api/proyectos/{pid}/terreno",
        headers=h,
        json={"vertices": [[0, 0], [100, 0], [100, 60], [0, 60]], "orientacion_norte": 0, "notas": None, "caminos": []},
    )
    assert api.put(f"/api/proyectos/{pid}/equipo", headers=h, json={**EQUIPO, "angulo_montaje": 0}).status_code == 200
    return pid, h


def _anchos(layout: dict) -> set[int]:
    return {t["paneles_ancho"] for t in layout["tipos"]}


def test_sin_a_minimo_se_generan_los_bloques_de_una_fila(api, proyecto):
    pid, h = proyecto
    r = api.post(f"/api/proyectos/{pid}/layout", headers=h, json=PARAMETROS)
    assert r.status_code == 200
    assert _anchos(r.json()) == {24, 1}
    assert r.json()["parametros"]["paneles_ancho_minimo"] == 1


def test_con_a_minimo_no_se_generan_y_el_valor_se_guarda(api, proyecto):
    pid, h = proyecto
    r = api.post(f"/api/proyectos/{pid}/layout", headers=h, json={**PARAMETROS, "paneles_ancho_minimo": 6})
    assert r.status_code == 200
    assert _anchos(r.json()) == {24}

    guardado = api.get(f"/api/proyectos/{pid}/layout", headers=h).json()
    assert guardado["parametros"]["paneles_ancho_minimo"] == 6


@pytest.mark.parametrize("valor, codigo", [(0, 422), (25, 422)])
def test_a_minimo_invalido(api, proyecto, valor, codigo):
    pid, h = proyecto
    r = api.post(f"/api/proyectos/{pid}/layout", headers=h, json={**PARAMETROS, "paneles_ancho_minimo": valor})
    assert r.status_code == codigo
