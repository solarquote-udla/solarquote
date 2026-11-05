"""
Lectura de PDF de CAD por geometría (app/services/pdf_vectorial.py), sin IA.

PDF vectoriales generados en la prueba con medidas conocidas: rectángulos
con el operador `re` y polilíneas cerradas con remates, las dos formas en
que AutoCAD los exporta.
"""

import io

import pytest
from PIL import Image

from app.services import ia, lectura
from app.services.pdf_vectorial import interpretar_pdf_vectorial
from tests.fabricas_pdf import crear_pdf, pagina


def _tipos(resultado):
    return sorted((b.paneles_largo, b.paneles_ancho, b.repeticiones, b.orientacion) for b in resultado.bloques)


@pytest.mark.parametrize("como", ["re", "polilinea"])
def test_bloques_exactos_como_el_boceto_de_cad(como):
    """Dos tipos, como San Pablo: 6 × 28 y 4 × 28 (a escala menor para la prueba)."""
    bloques = [(80 + c * 60, 100 + f * 100, 6, 28) for c in range(2) for f in range(3)]
    bloques += [(250 + c * 45, 100 + f * 100, 4, 28) for c in range(2) for f in range(2)]
    r = interpretar_pdf_vectorial(crear_pdf(pagina(bloques, como)))
    assert r.metodo == "pdf" and r.formato == "pdf"
    assert _tipos(r) == [(4, 28, 4, "vertical"), (6, 28, 6, "vertical")]
    assert "geometría del PDF" in r.advertencias[0]


def test_paneles_con_el_lado_mayor_vertical():
    """Si el panel está parado, A corre de izquierda a derecha: orientación horizontal."""
    bloques = [(100, 100 + f * 60, 3, 4) for f in range(2)]  # 3 columnas de paneles parados
    contenido = "".join(
        f"{x0 + i * 3.12:.2f} {y0 + j * 6.48:.2f} 3.00 6.36 re S\n"
        for x0, y0, L, A in bloques for i in range(L) for j in range(A)
    )
    r = interpretar_pdf_vectorial(crear_pdf("0.5 G\n" + contenido))
    assert [(b.paneles_largo, b.paneles_ancho, b.repeticiones, b.orientacion) for b in r.bloques] == [(4, 3, 2, "horizontal")]


def test_varias_paginas_suman_los_bloques():
    r = interpretar_pdf_vectorial(crear_pdf(pagina([(100, 100, 4, 10)]), pagina([(100, 100, 4, 10), (200, 100, 4, 10)])))
    assert _tipos(r) == [(4, 10, 3, "vertical")]


def test_pdf_escaneado_no_tiene_geometria():
    buffer = io.BytesIO()
    Image.new("RGB", (842, 1191), "white").save(buffer, format="PDF")
    assert interpretar_pdf_vectorial(buffer.getvalue()) is None


def test_rectangulos_cuadrados_no_son_paneles():
    cuadrados = "".join(f"{100 + i * 6:.2f} 100 5 5 re S\n" for i in range(20))
    assert interpretar_pdf_vectorial(crear_pdf(cuadrados)) is None


def test_pdf_ilegible_devuelve_none():
    assert interpretar_pdf_vectorial(b"%PDF-1.7\n" + b"0" * 100) is None


def test_un_pdf_de_cad_no_llama_a_la_ia(monkeypatch):
    """Exacto, en segundos y sin costo: no debe haber ninguna llamada a la API."""
    def prohibido(*a, **k):
        raise AssertionError("no debía llamar a la API de Claude")

    monkeypatch.setattr(ia.httpx, "post", prohibido)
    r = lectura.interpretar_boceto(crear_pdf(pagina([(100, 100, 4, 24), (200, 100, 4, 24)])), "pdf")
    assert r.metodo == "pdf"
    assert _tipos(r) == [(4, 24, 2, "vertical")]


def test_un_pdf_sin_geometria_pasa_a_la_ia(monkeypatch):
    llamadas = []
    monkeypatch.setattr(lectura, "interpretar_con_ia", lambda contenido, formato: llamadas.append(formato) or "ia")
    buffer = io.BytesIO()
    Image.new("RGB", (842, 1191), "white").save(buffer, format="PDF")
    assert lectura.interpretar_boceto(buffer.getvalue(), "pdf") == "ia"
    assert llamadas == ["pdf"]
