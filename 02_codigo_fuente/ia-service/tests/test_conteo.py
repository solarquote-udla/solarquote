"""Conteo de varillas con la API de Claude (RF-14), con la llamada HTTP simulada."""

import base64

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services import conteo
from app.services.ia import IaError, IaNoConfigurada

client = TestClient(app)
URL = "/api/varillas/contar"
CABECERA = {"X-Internal-Secret": settings.IA_SERVICE_SECRET}
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPG = b"\xff\xd8\xff\xe0" + b"0" * 64
PDF = b"%PDF-1.7\n" + b"0" * 64

SALIDA = {"cantidad": 352, "confianza": 0.85, "advertencias": ["Esquina superior en sombra."]}


def respuesta(status: int = 200, entrada: dict | None = None, json: dict | None = None) -> httpx.Response:
    if json is None:
        json = {"content": [{"type": "tool_use", "name": "registrar_conteo", "input": entrada or SALIDA}]}
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

    monkeypatch.setattr(conteo.httpx, "post", falso_post)
    return registro


def enviar(contenido: bytes, cabeceras: dict | None = None):
    return client.post(URL, files={"archivo": ("lote.jpg", contenido)}, headers=CABECERA if cabeceras is None else cabeceras)


# ─── Servicio ───────────────────────────────────────────────────────


def test_la_foto_se_envia_como_imagen_con_herramienta_obligatoria(llamadas):
    r = conteo.contar_varillas(JPG, "jpg")
    assert (r.cantidad, r.confianza, r.advertencias) == (352, 0.85, ["Esquina superior en sombra."])

    (llamada,) = llamadas
    cuerpo = llamada["json"]
    assert cuerpo["model"] == settings.ANTHROPIC_MODEL
    assert cuerpo["tool_choice"] == {"type": "tool", "name": "registrar_conteo"}
    imagen = cuerpo["messages"][0]["content"][0]
    assert imagen["type"] == "image" and imagen["source"]["media_type"] == "image/jpeg"
    assert base64.b64decode(imagen["source"]["data"]) == JPG
    assert llamada["headers"]["x-api-key"] == "sk-ant-prueba"


def test_las_instrucciones_explican_que_contar(llamadas):
    conteo.contar_varillas(PNG, "png")
    sistema = llamadas[0]["json"]["system"]
    for termino in ("extremo", "una sola vez", "No cuentes", "registrar_conteo"):
        assert termino in sistema


def test_sin_clave_no_llama_a_la_api(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", None)
    monkeypatch.setattr(conteo.httpx, "post", lambda *a, **k: pytest.fail("no debía llamar"))
    with pytest.raises(IaNoConfigurada):
        conteo.contar_varillas(PNG, "png")


@pytest.mark.parametrize(
    "falla",
    [
        lambda: respuesta(500, json={"error": {"message": "cuenta sk-ant-xyz sin saldo"}}),
        lambda: respuesta(json={"content": [{"type": "text", "text": "Hay unas 300"}]}),
        lambda: respuesta(entrada={"cantidad": -5, "confianza": 0.9, "advertencias": []}),
        lambda: respuesta(entrada={"confianza": 0.9, "advertencias": []}),
    ],
)
def test_respuestas_invalidas_dan_error_sin_filtrar_detalles(monkeypatch, con_clave, falla):
    monkeypatch.setattr(conteo.httpx, "post", lambda *a, **k: falla())
    with pytest.raises(IaError) as exc:
        conteo.contar_varillas(PNG, "png")
    assert "sk-ant" not in str(exc.value)


def test_tiempo_agotado_y_sin_red(monkeypatch, con_clave):
    def lento(*a, **k):
        raise httpx.ReadTimeout("lento")

    monkeypatch.setattr(conteo.httpx, "post", lento)
    with pytest.raises(IaError, match="tardó"):
        conteo.contar_varillas(PNG, "png")

    def sin_red(*a, **k):
        raise httpx.ConnectError("sin red")

    monkeypatch.setattr(conteo.httpx, "post", sin_red)
    with pytest.raises(IaError, match="conectar"):
        conteo.contar_varillas(PNG, "png")


def test_conteo_cero_explica_por_que(monkeypatch, con_clave):
    monkeypatch.setattr(conteo.httpx, "post", lambda *a, **k: respuesta(entrada={"cantidad": 0, "confianza": 0, "advertencias": []}))
    r = conteo.contar_varillas(PNG, "png")
    assert r.cantidad == 0 and r.advertencias


# ─── Endpoint ───────────────────────────────────────────────────────


def test_endpoint_devuelve_el_conteo(llamadas):
    r = enviar(JPG)
    assert r.status_code == 200, r.text
    assert r.json() == SALIDA


def test_endpoint_exige_el_secreto():
    assert enviar(JPG, cabeceras={}).status_code == 401
    assert enviar(JPG, cabeceras={"X-Internal-Secret": "otro"}).status_code == 401


def test_endpoint_rechaza_lo_que_no_es_una_foto(con_clave):
    assert enviar(PDF).status_code == 415
    assert enviar(b"texto plano").status_code == 415
    assert enviar(b"").status_code == 422
    assert enviar(PNG + b"0" * settings.TAMANO_MAXIMO_BYTES).status_code == 413


def test_endpoint_sin_clave_responde_503(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", None)
    r = enviar(PNG)
    assert r.status_code == 503 and "a mano" in r.json()["detail"]


def test_endpoint_traduce_fallas_de_la_ia_a_502(monkeypatch, con_clave):
    monkeypatch.setattr(conteo.httpx, "post", lambda *a, **k: respuesta(500, json={}))
    assert enviar(PNG).status_code == 502
