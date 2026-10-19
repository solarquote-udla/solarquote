"""Endpoint POST /api/bocetos/interpretar (RF-04): secreto, límites y formatos."""

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from tests.fabricas_dxf import crear_dxf

client = TestClient(app)
URL = "/api/bocetos/interpretar"
CABECERA = {"X-Internal-Secret": settings.IA_SERVICE_SECRET}
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def enviar(contenido: bytes, nombre: str = "boceto.dxf", cabeceras: dict | None = None):
    return client.post(URL, files={"archivo": (nombre, contenido)}, headers=CABECERA if cabeceras is None else cabeceras)


def test_rechaza_sin_secreto():
    assert enviar(crear_dxf([(0, 0, 4, 10)]), cabeceras={}).status_code == 401


def test_rechaza_secreto_incorrecto():
    assert enviar(crear_dxf([(0, 0, 4, 10)]), cabeceras={"X-Internal-Secret": "otro"}).status_code == 401


def test_health_no_expone_la_clave(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-ant-secreta")
    cuerpo = client.get("/health").json()
    assert cuerpo["ia_configurada"] is True
    assert "sk-ant" not in str(cuerpo)


def test_dxf_se_lee_sin_ia(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", None)
    r = enviar(crear_dxf([(0, 0, 4, 24), (15, 0, 4, 24)]))
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["formato"] == "dxf" and cuerpo["metodo"] == "dxf"
    assert [(b["paneles_largo"], b["paneles_ancho"], b["repeticiones"]) for b in cuerpo["bloques"]] == [(4, 24, 2)]


def test_el_formato_se_detecta_por_contenido_y_no_por_extension():
    """Un DXF con extensión .pdf se lee como DXF; un nombre no engaña al servicio."""
    r = enviar(crear_dxf([(0, 0, 4, 10), (15, 0, 4, 10)]), nombre="plano.pdf")
    assert r.status_code == 200 and r.json()["formato"] == "dxf"


def test_archivo_vacio():
    assert enviar(b"").status_code == 422


def test_archivo_demasiado_grande(monkeypatch):
    monkeypatch.setattr(settings, "TAMANO_MAXIMO_BYTES", 1000)
    r = enviar(PNG + b"\x00" * 1000, nombre="grande.png")
    assert r.status_code == 413


def test_dwg_pide_exportar_a_dxf():
    r = enviar(b"AC1032" + b"\x00" * 100, nombre="plano.dwg")
    assert r.status_code == 415
    assert "DXF" in r.json()["detail"]


@pytest.mark.parametrize("contenido", [b"hola mundo", b"PK\x03\x04 un zip", b"GIF89a....."])
def test_formato_desconocido(contenido):
    assert enviar(contenido, nombre="x.bin").status_code == 415


def test_dxf_sin_paneles():
    assert enviar(crear_dxf([], extras=True)).status_code == 422


def test_imagen_sin_clave_de_ia_responde_503(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", None)
    r = enviar(PNG, nombre="boceto.png")
    assert r.status_code == 503
    assert "DXF" in r.json()["detail"]
