"""Pruebas de /health/servicios (RNF-06): calc-service e ia-service por la red interna."""

import httpx
import pytest

from app.core.config import settings
from app.routers.health import servicios_health_check


def test_servicios_ok_si_ambos_responden_200(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(httpx, "get", lambda url, *, timeout: httpx.Response(200, json={"status": "ok"}))

    assert servicios_health_check() == {"calc_service": "ok", "ia_service": "ok"}


def test_servicios_caido_si_no_hay_conexion(monkeypatch: pytest.MonkeyPatch) -> None:
    def _get_falso(url, *, timeout):
        raise httpx.ConnectError("conexión rechazada")

    monkeypatch.setattr(httpx, "get", _get_falso)

    assert servicios_health_check() == {"calc_service": "caído", "ia_service": "caído"}


def test_servicios_caido_si_responde_con_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(httpx, "get", lambda url, *, timeout: httpx.Response(500))

    assert servicios_health_check() == {"calc_service": "caído", "ia_service": "caído"}


def test_servicios_distingue_cual_de_los_dos_cayo(monkeypatch: pytest.MonkeyPatch) -> None:
    def _get_falso(url, *, timeout):
        if url.startswith(settings.CALC_SERVICE_URL):
            return httpx.Response(200, json={"status": "ok"})
        raise httpx.ConnectError("conexión rechazada")

    monkeypatch.setattr(httpx, "get", _get_falso)

    assert servicios_health_check() == {"calc_service": "ok", "ia_service": "caído"}
