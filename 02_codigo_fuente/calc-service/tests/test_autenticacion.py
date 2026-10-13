"""Pruebas del secreto compartido entre servicios (DS-05, SQ-37)."""

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app

client = TestClient(app)

PAYLOAD = {
    "items": [{"paneles_largo": 4, "paneles_ancho": 3, "bloques": 1}],
    "precios": {
        "VAR1650": "7.20",
        "VAR1350": "6.20",
        "HEX_V18MM": "2.40",
        "SOP_A": "4.75",
        "SOP_V": "4.75",
        "SOP_V_E": "3.25",
        "ANT_B": "2.10",
        "ANT_VAR": "3.20",
        "CLAMP_F": "1.00",
        "CLAMP_I": "1.00",
    },
    "addendum_porcentaje": "0",
    "iva_porcentaje": "15",
}


def test_rechaza_sin_la_cabecera():
    respuesta = client.post("/api/cotizacion/calcular", json=PAYLOAD)
    assert respuesta.status_code == 401


def test_rechaza_con_el_secreto_equivocado():
    respuesta = client.post(
        "/api/cotizacion/calcular",
        json=PAYLOAD,
        headers={"X-Internal-Secret": "esto-no-es-el-secreto"},
    )
    assert respuesta.status_code == 401


def test_acepta_con_el_secreto_correcto():
    respuesta = client.post(
        "/api/cotizacion/calcular",
        json=PAYLOAD,
        headers={"X-Internal-Secret": settings.CALC_SERVICE_SECRET},
    )
    assert respuesta.status_code == 200


def test_health_no_exige_la_cabecera():
    """Railway llama /health sin ninguna cabecera: no se puede proteger."""
    respuesta = client.get("/health")
    assert respuesta.status_code == 200


def test_raiz_no_exige_la_cabecera():
    respuesta = client.get("/")
    assert respuesta.status_code == 200
