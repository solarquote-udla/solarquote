from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_check_responde_ok():
    respuesta = client.get("/health")
    assert respuesta.status_code == 200
    assert respuesta.json()["status"] == "ok"


def test_root_responde_mensaje():
    respuesta = client.get("/")
    assert respuesta.status_code == 200
    assert "documentacion" in respuesta.json()
