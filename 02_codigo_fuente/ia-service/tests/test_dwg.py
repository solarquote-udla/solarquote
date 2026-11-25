"""
Planos DWG (revisión del 23 de noviembre): se convierten a DXF con
LibreDWG y se leen por la geometría. El convertidor se simula con un
script que deja un DXF de prueba donde dwg2dxf dejaría el suyo.
"""

import os
import stat
import subprocess
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services.formato import detectar_formato
from tests.fabricas_dxf import crear_dxf

client = TestClient(app)
URL = "/api/bocetos/interpretar"
CABECERA = {"X-Internal-Secret": settings.IA_SERVICE_SECRET}
DWG = b"AC1032" + b"\x00" * 200


def enviar(contenido: bytes):
    return client.post(URL, files={"archivo": ("Implantacion.dwg", contenido)}, headers=CABECERA)


def convertidor_falso(tmp_path: Path, monkeypatch, dxf: bytes | None) -> None:
    """Pone en el PATH un dwg2dxf que copia `dxf` al archivo pedido con -o (o no escribe nada)."""
    origen = tmp_path / "origen.dxf"
    if dxf is not None:
        origen.write_bytes(dxf)
    script = tmp_path / "dwg2dxf"
    script.write_text(
        "#!/bin/sh\n"
        'while [ "$1" != "" ]; do if [ "$1" = "-o" ]; then shift; SALIDA="$1"; fi; shift; done\n'
        f'[ -f "{origen}" ] && cp "{origen}" "$SALIDA"\n'
        "exit 1\n"  # dwg2dxf suele salir con 1 por avisos aunque escriba el DXF
    )
    script.chmod(script.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setenv("PATH", f"{tmp_path}{os.pathsep}{os.environ['PATH']}")


def test_un_dwg_se_reconoce_por_su_contenido():
    assert detectar_formato(b"AC1032" + b"\x00" * 10) == "dwg"
    assert detectar_formato(b"AC1015" + b"\x00" * 10) == "dwg"


def test_dwg_convertido_se_lee_como_dxf_sin_ia(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", None)
    convertidor_falso(tmp_path, monkeypatch, crear_dxf([(0, 0, 4, 24), (15, 0, 4, 24)]))

    r = enviar(DWG)

    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo["formato"] == "dwg"
    assert cuerpo["metodo"] == "dxf"
    assert sum(b["repeticiones"] for b in cuerpo["bloques"]) == 2


def test_dwg_que_no_se_puede_convertir_pide_guardarlo_como_dxf(tmp_path, monkeypatch):
    convertidor_falso(tmp_path, monkeypatch, None)

    r = enviar(DWG)

    assert r.status_code == 422
    assert "Guárdalo como DXF" in r.json()["detail"]


def test_conversion_que_tarda_demasiado(tmp_path, monkeypatch):
    convertidor_falso(tmp_path, monkeypatch, None)

    def lento(*args, **kwargs):
        raise subprocess.TimeoutExpired(cmd="dwg2dxf", timeout=90)

    monkeypatch.setattr("app.services.dwg.subprocess.run", lento)

    r = enviar(DWG)

    assert r.status_code == 422
    assert "tardó demasiado" in r.json()["detail"]
