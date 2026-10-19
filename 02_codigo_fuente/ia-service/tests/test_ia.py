"""Lectura con la API de Claude (RF-04), con la llamada HTTP simulada."""

import base64

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services import ia
from app.services.ia import IaError, IaNoConfigurada, interpretar_con_ia

client = TestClient(app)
PDF = b"%PDF-1.7\n" + b"0" * 100
JPG = b"\xff\xd8\xff\xe0" + b"0" * 100

SALIDA = {
    "bloques": [
        {"etiqueta": "A", "paneles_largo": 4, "paneles_ancho": 24, "repeticiones": 30, "orientacion": "vertical", "confianza": 0.92},
        {"etiqueta": "B", "paneles_largo": 4, "paneles_ancho": 10, "repeticiones": 2, "orientacion": "vertical", "confianza": 0.7},
    ],
    "advertencias": ["Dos bloques del borde sur están tapados por un rótulo."],
}


def respuesta(status: int = 200, json: dict | None = None) -> httpx.Response:
    if json is None:
        json = {"content": [{"type": "tool_use", "name": "registrar_bloques", "input": SALIDA}]}
    return httpx.Response(status, json=json, request=httpx.Request("POST", settings.ANTHROPIC_URL))


@pytest.fixture
def con_clave(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-ant-prueba")


@pytest.fixture
def llamadas(monkeypatch, con_clave):
    registro: list[dict] = []

    def falso_post(url, **kwargs):
        registro.append({"url": url, **kwargs})
        return respuesta()

    monkeypatch.setattr(ia.httpx, "post", falso_post)
    return registro


def test_pdf_se_envia_como_documento_con_herramienta_obligatoria(llamadas):
    r = interpretar_con_ia(PDF, "pdf")
    assert r.metodo == "ia" and r.formato == "pdf"
    assert [(b.paneles_largo, b.paneles_ancho, b.repeticiones) for b in r.bloques] == [(4, 24, 30), (4, 10, 2)]
    assert r.advertencias == SALIDA["advertencias"]

    (llamada,) = llamadas
    assert llamada["headers"]["x-api-key"] == "sk-ant-prueba"
    assert llamada["headers"]["anthropic-version"] == ia.VERSION_API
    cuerpo = llamada["json"]
    assert cuerpo["model"] == settings.ANTHROPIC_MODEL
    assert cuerpo["tool_choice"] == {"type": "tool", "name": "registrar_bloques"}
    adjunto = cuerpo["messages"][0]["content"][0]
    assert adjunto["type"] == "document"
    assert adjunto["source"]["media_type"] == "application/pdf"
    assert base64.b64decode(adjunto["source"]["data"]) == PDF


def test_imagen_se_envia_como_imagen(llamadas):
    interpretar_con_ia(JPG, "jpg")
    adjunto = llamadas[0]["json"]["messages"][0]["content"][0]
    assert adjunto["type"] == "image" and adjunto["source"]["media_type"] == "image/jpeg"


def test_las_instrucciones_explican_la_notacion(llamadas):
    interpretar_con_ia(PDF, "pdf")
    sistema = llamadas[0]["json"]["system"]
    for termino in ("L = ", "A = ", "B = ", "inversores", "registrar_bloques"):
        assert termino in sistema


def test_sin_clave_no_llama_a_la_api(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", None)
    monkeypatch.setattr(ia.httpx, "post", lambda *a, **k: pytest.fail("no debía llamar a la API"))
    with pytest.raises(IaNoConfigurada):
        interpretar_con_ia(PDF, "pdf")


def test_error_de_la_api_no_reenvia_su_detalle(monkeypatch, con_clave):
    monkeypatch.setattr(
        ia.httpx, "post", lambda *a, **k: respuesta(401, {"error": {"message": "invalid x-api-key org-123"}})
    )
    with pytest.raises(IaError) as exc:
        interpretar_con_ia(PDF, "pdf")
    assert "401" in str(exc.value) and "org-123" not in str(exc.value)


def test_tiempo_agotado(monkeypatch, con_clave):
    def lento(*a, **k):
        raise httpx.ReadTimeout("lento")

    monkeypatch.setattr(ia.httpx, "post", lento)
    with pytest.raises(IaError, match="tardó demasiado"):
        interpretar_con_ia(PDF, "pdf")


@pytest.mark.parametrize(
    "cuerpo",
    [
        {"content": [{"type": "text", "text": "Veo cuatro bloques"}]},  # sin herramienta
        {"content": [{"type": "tool_use", "name": "registrar_bloques", "input": {"bloques": [{"paneles_largo": 0}]}}]},
        {"content": [{"type": "tool_use", "name": "registrar_bloques", "input": {"bloques": "muchos"}}]},
        {"otra": "cosa"},
    ],
)
def test_salida_malformada(monkeypatch, con_clave, cuerpo):
    monkeypatch.setattr(ia.httpx, "post", lambda *a, **k: respuesta(200, cuerpo))
    with pytest.raises(IaError, match="no se pudo interpretar"):
        interpretar_con_ia(PDF, "pdf")


def test_sin_bloques_advierte(monkeypatch, con_clave):
    vacio = {"content": [{"type": "tool_use", "name": "registrar_bloques", "input": {"bloques": [], "advertencias": []}}]}
    monkeypatch.setattr(ia.httpx, "post", lambda *a, **k: respuesta(200, vacio))
    r = interpretar_con_ia(PDF, "pdf")
    assert r.bloques == [] and "a mano" in r.advertencias[0]


def test_endpoint_traduce_errores_de_la_ia(monkeypatch, con_clave):
    monkeypatch.setattr(ia.httpx, "post", lambda *a, **k: respuesta(500, {}))
    r = client.post(
        "/api/bocetos/interpretar",
        files={"archivo": ("b.pdf", PDF)},
        headers={"X-Internal-Secret": settings.IA_SERVICE_SECRET},
    )
    assert r.status_code == 502


def test_endpoint_pdf_correcto(llamadas):
    r = client.post(
        "/api/bocetos/interpretar",
        files={"archivo": ("b.pdf", PDF)},
        headers={"X-Internal-Secret": settings.IA_SERVICE_SECRET},
    )
    assert r.status_code == 200
    assert r.json()["bloques"][0]["confianza"] == 0.92
