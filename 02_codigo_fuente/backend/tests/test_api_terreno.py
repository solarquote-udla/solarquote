"""
Contrato HTTP del terreno y sus caminos (RF-01).

La geometría (áreas, caminos que se cruzan, polígonos inválidos) se
prueba en test_geometria. Aquí: el ciclo completo por la API, la
traducción de errores a códigos HTTP y el permiso.
Origen: matriz de trazabilidad (03_pruebas/trazabilidad).
"""

import pytest

from app.core.permisos import Permiso
from app.models.cliente import Cliente, TipoIdentificacion
from tests.fabricas import crear_usuario, perfil_personalizado
from tests.test_varios_inversores import _cabecera, api, h  # noqa: F401

INEXISTENTE = 999_999
RECT = [[0, 0], [45, 0], [45, 60], [0, 60]]
CAMINO = {"nombre": "Camino H1", "tipo": "interno", "vertices": [[0, 28], [45, 28], [45, 32], [0, 32]]}


@pytest.fixture
def proyecto(api, db, h) -> int:  # noqa: F811
    cliente = Cliente(nombre="Cliente terreno", tipo_identificacion=TipoIdentificacion.RUC, identificacion="1710034065001")
    db.add(cliente)
    db.flush()
    r = api.post(
        "/api/proyectos",
        headers=h,
        json={"nombre": "Hacienda San José", "cliente_id": cliente.id, "ubicacion": None, "latitud": 0.3, "longitud": None, "notas": None},
    )
    return r.json()["id"]


def ruta(pid: int) -> str:
    return f"/api/proyectos/{pid}/terreno"


def test_terreno_y_caminos_ciclo_completo(api, h, proyecto):
    r = api.post(ruta(proyecto), headers=h, json={"vertices": RECT, "orientacion_norte": 0, "notas": None, "caminos": []})
    assert r.status_code == 201, r.text
    assert r.json()["areas"] == {"area_bruta": 2700.0, "area_caminos": 0.0, "area_util": 2700.0}
    assert api.get(f"/api/proyectos/{proyecto}", headers=h).json()["estado"] == "en_diseno"

    r = api.post(f"{ruta(proyecto)}/caminos", headers=h, json=CAMINO)
    assert r.status_code == 201, r.text
    camino_id = r.json()["id"]
    # RF-01: el área de los caminos se descuenta del área útil
    assert api.get(ruta(proyecto), headers=h).json()["areas"] == {"area_bruta": 2700.0, "area_caminos": 180.0, "area_util": 2520.0}

    r = api.patch(ruta(proyecto), headers=h, json={"orientacion_norte": 15})
    assert r.status_code == 200 and r.json()["orientacion_norte"] == 15

    assert api.delete(f"{ruta(proyecto)}/caminos/{camino_id}", headers=h).status_code == 204
    assert api.get(ruta(proyecto), headers=h).json()["areas"]["area_util"] == 2700.0

    assert api.delete(ruta(proyecto), headers=h).status_code == 204
    assert api.get(ruta(proyecto), headers=h).status_code == 404


def test_terreno_errores_traducidos(api, h, proyecto):
    # Sin terreno todavía
    assert api.get(ruta(proyecto), headers=h).status_code == 404
    assert api.patch(ruta(proyecto), headers=h, json={"orientacion_norte": 10}).status_code == 404
    assert api.post(f"{ruta(proyecto)}/caminos", headers=h, json=CAMINO).status_code == 404

    # RF-01: el polígono necesita al menos tres vértices y no puede cruzarse
    assert api.post(ruta(proyecto), headers=h, json={"vertices": [[0, 0], [10, 0]], "caminos": []}).status_code == 422
    assert api.post(ruta(proyecto), headers=h, json={"vertices": [[0, 0], [10, 10], [10, 0], [0, 10]], "caminos": []}).status_code == 422

    assert api.post(ruta(proyecto), headers=h, json={"vertices": RECT, "caminos": []}).status_code == 201
    # Un proyecto tiene un solo terreno: se modifica con PATCH
    assert api.post(ruta(proyecto), headers=h, json={"vertices": RECT, "caminos": []}).status_code == 409
    assert api.delete(f"{ruta(proyecto)}/caminos/{INEXISTENTE}", headers=h).status_code == 404
    assert api.patch(ruta(proyecto), headers=h, json={"orientacion_norte": 360}).status_code == 422

    # Proyecto inexistente
    assert api.get(ruta(INEXISTENTE), headers=h).status_code == 404
    assert api.post(ruta(INEXISTENTE), headers=h, json={"vertices": RECT, "caminos": []}).status_code == 404


def test_terreno_exige_generar_layout(api, db, proyecto):
    sin_permiso = _cabecera(crear_usuario(db, perfil=perfil_personalizado(db, Permiso.CLIENTES)))
    assert api.post(ruta(proyecto), headers=sin_permiso, json={"vertices": RECT, "caminos": []}).status_code == 403
    assert api.get(ruta(proyecto), headers=sin_permiso).status_code == 403
