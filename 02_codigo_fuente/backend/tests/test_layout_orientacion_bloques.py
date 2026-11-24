"""
Orientación de los bloques — RF-03.

Revisión del 23 de noviembre: en los planos de HEXtructure de terrenos en
diagonal (Envasur) los bloques van paralelos al terreno, no al norte.
`lado_bloques` alinea los bloques con un lado del terreno, girándolos lo
mínimo (como mucho 45°) para que las filas sigan cerca de norte-sur.
"""

import math

import pytest
from fastapi.testclient import TestClient
from shapely.affinity import rotate
from shapely.geometry import Polygon
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import crear_access_token
from app.main import app
from app.models.cliente import Cliente, TipoIdentificacion
from app.services.calculo_layout import LayoutImposible, ParametrosLayout, generar_layout, giro_hacia_lado
from tests.fabricas import LAYOUT_CLASICO, crear_usuario
from tests.test_layout import PANEL_PLANO, rectangulo
from tests.test_proyecto_avance import EQUIPO


def _girado(vertices: list[list[float]], grados: float) -> list[list[float]]:
    """El terreno girado `grados` en sentido antihorario, con vértices redondeados al mm."""
    poligono = rotate(Polygon(vertices), grados, origin=(0, 0))
    return [[round(x, 3), round(y, 3)] for x, y in list(poligono.exterior.coords)[:-1]]


def _angulo_lado(p: list[float], q: list[float]) -> float:
    return math.degrees(math.atan2(q[1] - p[1], q[0] - p[0]))


def _paralelo_o_perpendicular(a: float, b: float) -> bool:
    diferencia = (a - b) % 90
    return min(diferencia, 90 - diferencia) < 0.01


# ─── giro_hacia_lado ────────────────────────────────────────────────


def test_terreno_recto_no_gira_con_ningun_lado():
    terreno = rectangulo(100, 60)
    assert [giro_hacia_lado(terreno, i, 0) for i in range(4)] == [0, 0, 0, 0]


@pytest.mark.parametrize("grados, esperado", [(30, -30), (-20, 20), (60, 30), (44, -44)])
def test_el_giro_es_el_minimo_entre_menos_45_y_45(grados, esperado):
    """Un terreno girado 60° se alinea girando 30° hacia el otro lado, no 60°."""
    terreno = _girado(rectangulo(100, 60), grados)
    assert giro_hacia_lado(terreno, 0, 0) == pytest.approx(esperado, abs=1e-3)


def test_el_giro_se_mide_desde_el_norte_del_terreno():
    """Con el norte ya girado igual que el terreno, no hace falta girar más."""
    terreno = _girado(rectangulo(100, 60), -25)
    assert giro_hacia_lado(terreno, 0, 25) == pytest.approx(0, abs=1e-3)


def test_lado_que_no_existe_se_rechaza():
    with pytest.raises(LayoutImposible, match="4 lados"):
        giro_hacia_lado(rectangulo(100, 60), 4, 0)


# ─── generar_layout con lado_bloques ────────────────────────────────


def test_terreno_en_diagonal_alineado_entra_como_el_recto():
    """
    El rectángulo de 100 × 60 (1764 paneles con el norte hacia arriba)
    girado 30°: siguiendo el norte entran menos; alineado con su lado
    largo, entran los mismos 1764.
    """
    terreno = _girado(rectangulo(100, 60), 30)
    parametros = ParametrosLayout(paneles_ancho=24)

    al_norte = generar_layout(terreno, [], PANEL_PLANO, parametros, orientacion_norte=0)
    alineado = generar_layout(terreno, [], PANEL_PLANO, parametros, orientacion_norte=0, lado_bloques=0)

    assert alineado.total_paneles == 1764
    assert al_norte.total_paneles < alineado.total_paneles
    assert alineado.angulo_norte == pytest.approx(-30, abs=1e-3)

    lado = _angulo_lado(terreno[0], terreno[1])
    poligono = Polygon(terreno).buffer(1e-3)
    for b in alineado.bloques:
        assert poligono.contains(Polygon(b.vertices))
        assert _paralelo_o_perpendicular(_angulo_lado(b.vertices[0], b.vertices[1]), lado)


def test_avisa_cuanto_se_giraron_los_bloques():
    terreno = _girado(rectangulo(100, 60), 30)
    r = generar_layout(terreno, [], PANEL_PLANO, ParametrosLayout(paneles_ancho=24), orientacion_norte=0, lado_bloques=0)
    assert any("girados 30.0° respecto del norte" in a and "lado 1" in a for a in r.advertencias)


def test_sin_giro_no_avisa():
    r = generar_layout(rectangulo(100, 60), [], PANEL_PLANO, ParametrosLayout(paneles_ancho=24), orientacion_norte=0, lado_bloques=2)
    assert r.total_paneles == 1764
    assert not any("girados" in a for a in r.advertencias)


# ─── API ────────────────────────────────────────────────────────────

PARAMETROS = {"paneles_largo": 4, "pasillo_m": 2, "tolerancia_proporcion": 0.2, "capacidad_deseada_kwp": None, **LAYOUT_CLASICO}


@pytest.fixture
def api(db: Session):
    app.dependency_overrides[get_db] = lambda: db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def proyecto(api, db):
    """El rectángulo de 100 × 60 girado 30°, con el norte hacia arriba y panel plano."""
    usuario = crear_usuario(db)
    cliente = Cliente(nombre="Cliente orientación", tipo_identificacion=TipoIdentificacion.RUC, identificacion="1710034065001")
    db.add(cliente)
    db.flush()
    h = {"Authorization": f"Bearer {crear_access_token(usuario_id=usuario.id, version=usuario.version_token)}"}
    pid = api.post(
        "/api/proyectos",
        headers=h,
        json={"nombre": "Orientación", "cliente_id": cliente.id, "ubicacion": None, "latitud": None, "longitud": None, "notas": None},
    ).json()["id"]
    vertices = _girado(rectangulo(100, 60), 30)
    r = api.post(
        f"/api/proyectos/{pid}/terreno",
        headers=h,
        json={"vertices": vertices, "orientacion_norte": 0, "notas": None, "caminos": []},
    )
    assert r.status_code in (200, 201), r.text
    assert api.put(f"/api/proyectos/{pid}/equipo", headers=h, json={**EQUIPO, "angulo_montaje": 0}).status_code == 200
    return pid, h


def test_sin_lado_los_bloques_siguen_el_norte(api, proyecto):
    pid, h = proyecto
    r = api.post(f"/api/proyectos/{pid}/layout", headers=h, json=PARAMETROS)
    assert r.status_code == 200
    assert r.json()["parametros"]["lado_bloques"] is None
    assert r.json()["angulo_norte"] == 0


def test_con_lado_se_alinean_y_el_lado_se_guarda(api, proyecto):
    pid, h = proyecto
    r = api.post(f"/api/proyectos/{pid}/layout", headers=h, json={**PARAMETROS, "lado_bloques": 0})
    assert r.status_code == 200
    assert r.json()["total_paneles"] == 1764
    assert r.json()["angulo_norte"] == pytest.approx(-30, abs=1e-3)

    guardado = api.get(f"/api/proyectos/{pid}/layout", headers=h).json()
    assert guardado["parametros"]["lado_bloques"] == 0


def test_editar_conserva_el_giro_de_los_bloques(api, proyecto):
    """Al editar, el backend rehace cada bloque con el giro con que se generó."""
    pid, h = proyecto
    generado = api.post(f"/api/proyectos/{pid}/layout", headers=h, json={**PARAMETROS, "lado_bloques": 0}).json()
    bloques = [{"origen": b["vertices"][3], "paneles_ancho": b["paneles_ancho"]} for b in generado["bloques"][:-1]]

    r = api.put(f"/api/proyectos/{pid}/layout/bloques", headers=h, json={"bloques": bloques})

    assert r.status_code == 200, r.text
    assert r.json()["angulo_norte"] == pytest.approx(-30, abs=1e-3)
    assert r.json()["parametros"]["lado_bloques"] == 0

    def esquinas(bloques):
        return sorted(tuple(round(c, 2) for punto in b["vertices"] for c in punto) for b in bloques)

    assert esquinas(r.json()["bloques"]) == esquinas(generado["bloques"][:-1])


def test_lado_que_no_existe_responde_422(api, proyecto):
    pid, h = proyecto
    r = api.post(f"/api/proyectos/{pid}/layout", headers=h, json={**PARAMETROS, "lado_bloques": 7})
    assert r.status_code == 422
    assert "4 lados" in r.json()["detail"]
