"""
Pruebas del CORS para las previews de Vercel.

El patrón de ejemplo es el mismo formato que se documenta en DESPLIEGUE.md,
con un scope ficticio. Lo que se prueba es que el formato acepte las dos
clases de URL que genera Vercel y rechace las que solo se le parecen.
"""

import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.main import app as app_real

SCOPE = "equipo-ejemplo"
PATRON = rf"^https://solarquote-[a-z0-9-]+-{SCOPE}\.vercel\.app$"
PRODUCCION = "https://solarquote-hextructure.vercel.app"


@pytest.fixture
def cliente() -> TestClient:
    """App mínima con la misma configuración de CORS que la real."""
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[PRODUCCION],
        allow_origin_regex=PATRON,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/ping")
    def ping() -> dict:
        return {"ok": True}

    return TestClient(app)


def _origen_permitido(cliente: TestClient, origen: str) -> bool:
    """Simula el preflight que hace el navegador antes de un POST con token."""
    respuesta = cliente.options(
        "/ping",
        headers={
            "Origin": origen,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    return respuesta.headers.get("access-control-allow-origin") == origen


@pytest.mark.parametrize(
    "origen",
    [
        PRODUCCION,  # lista fija
        f"https://solarquote-a1b2c3d4e-{SCOPE}.vercel.app",  # preview por despliegue
        f"https://solarquote-git-feat-sq-60-bloques-{SCOPE}.vercel.app",  # preview por rama
    ],
)
def test_acepta_produccion_y_previews(cliente: TestClient, origen: str) -> None:
    assert _origen_permitido(cliente, origen)


@pytest.mark.parametrize(
    "origen",
    [
        # Otro scope: un tercero con un proyecto que empiece igual
        "https://solarquote-a1b2c3d4e-otro-equipo.vercel.app",
        # El dominio real como subdominio de uno ajeno
        f"https://solarquote-a1b2c3d4e-{SCOPE}.vercel.app.evil.com",
        # http en lugar de https
        f"http://solarquote-a1b2c3d4e-{SCOPE}.vercel.app",
        # Mayúsculas: Vercel siempre genera minúsculas
        f"https://SOLARQUOTE-A1B2-{SCOPE}.vercel.app",
        # Otro proyecto del mismo scope
        f"https://otroproyecto-a1b2c3d4e-{SCOPE}.vercel.app",
    ],
)
def test_rechaza_origenes_parecidos(cliente: TestClient, origen: str) -> None:
    assert not _origen_permitido(cliente, origen)


def test_regex_invalido_tumba_el_arranque() -> None:
    with pytest.raises(ValidationError, match="CORS_ORIGIN_REGEX"):
        Settings(DATABASE_URL="postgresql://x/x", SECRET_KEY="x", CORS_ORIGIN_REGEX="solarquote-(")


def test_regex_vacio_equivale_a_no_configurarlo() -> None:
    config = Settings(DATABASE_URL="postgresql://x/x", SECRET_KEY="x", CORS_ORIGIN_REGEX="  ")
    assert config.CORS_ORIGIN_REGEX is None


def test_la_app_real_pasa_el_regex_al_middleware() -> None:
    """Evita que alguien quite el parámetro de main.py sin darse cuenta."""
    cors = next(m for m in app_real.user_middleware if m.cls is CORSMiddleware)
    assert "allow_origin_regex" in cors.kwargs
