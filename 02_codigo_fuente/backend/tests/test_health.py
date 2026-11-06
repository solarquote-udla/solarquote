"""Pruebas de /health/db y /health/servicios (RNF-06).

Corren contra la API real (TestClient) para verificar también el código
HTTP: un monitor externo (UptimeRobot) decide arriba/caído por el código
de la respuesta, no por su contenido.
"""

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.main import app


@pytest.fixture
def api(db: Session):
    app.dependency_overrides[get_db] = lambda: db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_health_db_ok_responde_200(api: TestClient) -> None:
    respuesta = api.get("/health/db")

    assert respuesta.status_code == 200
    assert respuesta.json() == {"status": "ok", "database": "conectada"}


def test_health_db_caido_responde_503_sin_exponer_el_detalle(caplog: pytest.LogCaptureFixture) -> None:
    class _SesionRota:
        def execute(self, *args, **kwargs):
            raise RuntimeError("password authentication failed for user solarquote_app_secreto")

    app.dependency_overrides[get_db] = lambda: _SesionRota()
    try:
        respuesta = TestClient(app).get("/health/db")
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert respuesta.status_code == 503
    assert respuesta.json() == {"status": "error", "database": "sin conexión"}
    assert "solarquote_app_secreto" not in respuesta.text
    assert "solarquote_app_secreto" in caplog.text


def test_servicios_ok_responde_200(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(httpx, "get", lambda url, *, timeout: httpx.Response(200, json={"status": "ok"}))

    respuesta = TestClient(app).get("/health/servicios")

    assert respuesta.status_code == 200
    assert respuesta.json() == {"calc_service": "ok", "ia_service": "ok"}


def test_servicios_caido_si_no_hay_conexion_responde_503(monkeypatch: pytest.MonkeyPatch) -> None:
    def _get_falso(url, *, timeout):
        raise httpx.ConnectError("conexión rechazada")

    monkeypatch.setattr(httpx, "get", _get_falso)

    respuesta = TestClient(app).get("/health/servicios")

    assert respuesta.status_code == 503
    assert respuesta.json() == {"calc_service": "caído", "ia_service": "caído"}


def test_servicios_caido_si_responde_con_error_responde_503(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(httpx, "get", lambda url, *, timeout: httpx.Response(500))

    respuesta = TestClient(app).get("/health/servicios")

    assert respuesta.status_code == 503
    assert respuesta.json() == {"calc_service": "caído", "ia_service": "caído"}


def test_servicios_distingue_cual_de_los_dos_cayo(monkeypatch: pytest.MonkeyPatch) -> None:
    def _get_falso(url, *, timeout):
        if url.startswith(settings.CALC_SERVICE_URL):
            return httpx.Response(200, json={"status": "ok"})
        raise httpx.ConnectError("conexión rechazada")

    monkeypatch.setattr(httpx, "get", _get_falso)

    respuesta = TestClient(app).get("/health/servicios")

    assert respuesta.status_code == 503
    assert respuesta.json() == {"calc_service": "ok", "ia_service": "caído"}
