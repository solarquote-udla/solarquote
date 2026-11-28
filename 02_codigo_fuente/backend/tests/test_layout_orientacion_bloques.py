"""
Orientación de los bloques — RF-03.

Revisión del 25 de noviembre: en los planos reales de HEXtructure los
bloques siguen el terreno (Envasur, Ecuahielos), no siempre el norte, y no
siempre con las filas en la misma dirección. "Alineado al terreno" prueba
cada dirección de lado con las filas a lo largo y de través, y se queda con
la que más paneles ubica. Las dos orientaciones se calculan siempre para
sugerir la mejor.
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
from app.services.calculo_layout import (
    LayoutImposible,
    PanelLayout,
    ParametrosLayout,
    angulos_del_terreno,
    generar_layout,
)
from tests.fabricas import LAYOUT_CLASICO, crear_usuario
from tests.test_layout import PANEL_PLANO, rectangulo
from tests.test_proyecto_avance import EQUIPO

# Panel de 720 Wp de la CT203A y la CT521A
PANEL_720 = PanelLayout(largo_mm=2384, ancho_mm=1303, potencia_wp=720, angulo_montaje=7.5)

# Planta de Envasur (CT203A, 1.209,6 kWp): puntos P7, P8, P6 y P5 del plano
# 1899-ARQ-PL-001, coordenadas UTM redondeadas al metro, llevadas a P7.
ENVASUR = [[0, 0], [29, -26], [122, 100], [92, 122]]


def _girado(vertices: list[list[float]], grados: float) -> list[list[float]]:
    """El terreno girado `grados` en sentido antihorario, con vértices redondeados al mm."""
    poligono = rotate(Polygon(vertices), grados, origin=(0, 0))
    return [[round(x, 3), round(y, 3)] for x, y in list(poligono.exterior.coords)[:-1]]


def _angulo_lado(p: list[float], q: list[float]) -> float:
    return math.degrees(math.atan2(q[1] - p[1], q[0] - p[0]))


def _paralelo_o_perpendicular(a: float, b: float) -> bool:
    diferencia = (a - b) % 90
    return min(diferencia, 90 - diferencia) < 0.01


# ─── angulos_del_terreno ────────────────────────────────────────────


def test_rectangulo_recto_propone_norte_y_su_giro_de_90():
    """Filas a lo largo de un lado o de través: dos posiciones por dirección."""
    assert sorted(angulos_del_terreno(rectangulo(100, 60))) == [-90, 0]


def test_lados_paralelos_no_repiten_direccion():
    """Un rectángulo girado tiene 4 lados pero una sola dirección (y su perpendicular)."""
    angulos = angulos_del_terreno(_girado(rectangulo(100, 60), 30))
    assert len(angulos) == 2


def test_lado_muy_corto_no_propone_direccion():
    """Un quiebre de 2 m en un terreno de 100 m no ordena los bloques."""
    terreno = [[0, 0], [100, 0], [100, 60], [2, 60], [0, 58]]
    assert len(angulos_del_terreno(terreno)) == 2


# ─── generar_layout ─────────────────────────────────────────────────


def test_envasur_alineado_al_terreno_da_los_seis_bloques_de_la_ct203a():
    """
    Con el terreno real de Envasur, L = 10 y A = 28, siguiendo el norte no
    entra ningún bloque; alineados con la franja y con las filas de través,
    entran los 6 bloques de 10 × 28 de la proforma CT203A (1.680 paneles).
    El pasillo de 1,5 m es el que deja el plano real.
    """
    parametros = ParametrosLayout(
        paneles_largo=10, paneles_ancho=28, pasillo_este_oeste_m=1.5, pasillo_norte_sur_m=1.5,
        separacion_largo_m=0.06, separacion_ancho_m=0.02, paneles_ancho_minimo=28,
    )
    r = generar_layout(ENVASUR, [], PANEL_720, parametros, orientacion_norte=0, latitud=-1.05, orientacion_bloques="terreno")

    assert r.total_paneles == 1680
    assert [(t.paneles_largo, t.paneles_ancho, t.repeticiones) for t in r.tipos] == [(10, 28, 6)]
    assert r.paneles_norte == 0 and r.paneles_terreno == 1680
    assert r.orientacion_bloques == "terreno"
    poligono = Polygon(ENVASUR).buffer(1e-3)
    assert all(poligono.contains(Polygon(b.vertices)) for b in r.bloques)


def test_siguiendo_el_norte_sin_lugar_sugiere_alinear():
    parametros = ParametrosLayout(
        paneles_largo=10, paneles_ancho=28, pasillo_este_oeste_m=1.5, pasillo_norte_sur_m=1.5, paneles_ancho_minimo=28,
    )
    with pytest.raises(LayoutImposible, match="Alineando los bloques con el terreno sí entran"):
        generar_layout(ENVASUR, [], PANEL_720, parametros, orientacion_norte=0, latitud=-1.05)


def test_terreno_girado_alineado_entra_como_el_recto():
    """El rectángulo de 100 × 60 girado 30°: alineado entra lo mismo que recto, y los bloques quedan paralelos."""
    terreno = _girado(rectangulo(100, 60), 30)
    parametros = ParametrosLayout(paneles_ancho=24)

    al_norte = generar_layout(terreno, [], PANEL_PLANO, parametros, orientacion_norte=0)
    alineado = generar_layout(terreno, [], PANEL_PLANO, parametros, orientacion_norte=0, orientacion_bloques="terreno")

    assert alineado.total_paneles >= 1764
    assert al_norte.total_paneles < alineado.total_paneles
    lado = _angulo_lado(terreno[0], terreno[1])
    for b in alineado.bloques:
        assert _paralelo_o_perpendicular(_angulo_lado(b.vertices[0], b.vertices[1]), lado)


def test_siguiendo_el_norte_avisa_si_alineado_entran_mas():
    terreno = _girado(rectangulo(100, 60), 30)
    r = generar_layout(terreno, [], PANEL_PLANO, ParametrosLayout(paneles_ancho=24), orientacion_norte=0)
    assert r.orientacion_bloques == "norte"
    assert r.paneles_terreno > r.paneles_norte
    assert any("Alineando los bloques con el terreno entrarían" in a for a in r.advertencias)


def test_alineado_avisa_cuanto_se_giro_y_cuanto_entra_al_norte():
    terreno = _girado(rectangulo(100, 60), 30)
    r = generar_layout(terreno, [], PANEL_PLANO, ParametrosLayout(paneles_ancho=24), orientacion_norte=0, orientacion_bloques="terreno")
    assert any("Bloques alineados con el terreno, girados" in a and "siguiendo el norte entrarían" in a for a in r.advertencias)


def test_a_igualdad_de_paneles_elige_el_giro_mas_cercano_al_norte():
    """En un cuadrado, el norte y su giro de 90° empatan: se queda el norte."""
    parametros = ParametrosLayout(paneles_largo=4, paneles_ancho=12, pasillo_este_oeste_m=2, pasillo_norte_sur_m=2)
    r = generar_layout(rectangulo(60, 60), [], PANEL_PLANO, parametros, orientacion_norte=0, orientacion_bloques="terreno")
    if r.paneles_terreno == r.paneles_norte:
        assert r.angulo_norte == 0


def test_orientacion_desconocida_se_rechaza():
    with pytest.raises(LayoutImposible, match="norte o terreno"):
        generar_layout(rectangulo(100, 60), [], PANEL_PLANO, ParametrosLayout(), orientacion_norte=0, orientacion_bloques="este")


# ─── API ────────────────────────────────────────────────────────────

PARAMETROS = {
    "paneles_largo": 4,
    "pasillo_este_oeste_m": 2,
    "pasillo_norte_sur_m": 2,
    "tolerancia_proporcion": 0.2,
    "capacidad_deseada_kwp": None,
    **LAYOUT_CLASICO,
}


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


def test_por_defecto_los_bloques_siguen_el_norte_y_se_informa_la_alternativa(api, proyecto):
    pid, h = proyecto
    r = api.post(f"/api/proyectos/{pid}/layout", headers=h, json=PARAMETROS)
    assert r.status_code == 200
    assert r.json()["parametros"]["orientacion_bloques"] == "norte"
    assert r.json()["angulo_norte"] == 0
    por_orientacion = r.json()["paneles_por_orientacion"]
    assert por_orientacion["terreno"] > por_orientacion["norte"] == r.json()["total_paneles"]


def test_alineado_al_terreno_se_guarda(api, proyecto):
    pid, h = proyecto
    r = api.post(f"/api/proyectos/{pid}/layout", headers=h, json={**PARAMETROS, "orientacion_bloques": "terreno"})
    assert r.status_code == 200
    assert r.json()["total_paneles"] >= 1764
    assert _paralelo_o_perpendicular(r.json()["angulo_norte"], -30)

    guardado = api.get(f"/api/proyectos/{pid}/layout", headers=h).json()
    assert guardado["parametros"]["orientacion_bloques"] == "terreno"


def test_editar_conserva_el_giro_de_los_bloques(api, proyecto):
    """Al editar, el backend rehace cada bloque con el giro con que se generó."""
    pid, h = proyecto
    generado = api.post(f"/api/proyectos/{pid}/layout", headers=h, json={**PARAMETROS, "orientacion_bloques": "terreno"}).json()
    bloques = [{"origen": b["vertices"][3], "paneles_ancho": b["paneles_ancho"]} for b in generado["bloques"][:-1]]

    r = api.put(f"/api/proyectos/{pid}/layout/bloques", headers=h, json={"bloques": bloques})

    assert r.status_code == 200, r.text
    assert r.json()["angulo_norte"] == pytest.approx(generado["angulo_norte"], abs=1e-6)
    assert r.json()["parametros"]["orientacion_bloques"] == "terreno"

    def esquinas(bloques):
        return sorted(tuple(round(c, 2) for punto in b["vertices"] for c in punto) for b in bloques)

    assert esquinas(r.json()["bloques"]) == esquinas(generado["bloques"][:-1])


def test_orientacion_invalida_responde_422(api, proyecto):
    pid, h = proyecto
    r = api.post(f"/api/proyectos/{pid}/layout", headers=h, json={**PARAMETROS, "orientacion_bloques": "este"})
    assert r.status_code == 422
