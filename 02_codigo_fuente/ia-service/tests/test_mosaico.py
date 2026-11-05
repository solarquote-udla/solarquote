"""
PDF convertido en mosaico de imágenes para la IA (app/services/mosaico.py).

Se usan PDF reales generados con Pillow: así se prueba de verdad que
pypdfium2 los abre y que las imágenes salen con el tamaño que la API
procesa sin reducir.
"""

import base64
import io
import os

from PIL import Image, ImageDraw

from app.services import mosaico


def _pdf(paginas: int = 1, tamano=(842, 1191)) -> bytes:
    hojas = []
    for _ in range(paginas):
        hoja = Image.new("RGB", tamano, "white")
        dibujo = ImageDraw.Draw(hoja)
        for x in range(100, 700, 120):  # unos bloques con grilla
            dibujo.rectangle([x, 300, x + 90, 900], outline="gray")
            for y in range(300, 900, 20):
                dibujo.line([x, y, x + 90, y], fill="gray")
        hojas.append(hoja)
    buffer = io.BytesIO()
    hojas[0].save(buffer, format="PDF", save_all=True, append_images=hojas[1:])
    return buffer.getvalue()


def _imagenes(bloques):
    return [b for b in bloques if b["type"] == "image"]


def _abrir(bloque) -> Image.Image:
    return Image.open(io.BytesIO(base64.b64decode(bloque["source"]["data"])))


def test_una_pagina_da_la_pagina_completa_y_cuatro_ampliaciones():
    bloques, avisos = mosaico.pdf_como_mosaico(_pdf())
    imagenes = _imagenes(bloques)
    assert len(imagenes) == 5
    assert avisos == []
    completa = _abrir(imagenes[0])
    assert max(completa.size) == mosaico.LADO_MAXIMO
    for ampliacion in imagenes[1:]:
        # cada cuadrante, con el solape, queda cerca del lado máximo (algo más grande)
        lado = max(_abrir(ampliacion).size)
        assert mosaico.LADO_MAXIMO < lado < 1.2 * mosaico.LADO_MAXIMO
    textos = [b["text"] for b in bloques if b["type"] == "text"]
    assert textos[0] == "página completa del boceto:"
    assert "cuadrante superior izquierdo" in textos[1]
    assert textos[-1] == mosaico.GUIA


def test_cada_imagen_va_precedida_de_su_rotulo():
    bloques, _ = mosaico.pdf_como_mosaico(_pdf())
    for i, bloque in enumerate(bloques):
        if bloque["type"] == "image":
            assert bloques[i - 1]["type"] == "text"


def test_varias_paginas_se_limitan_y_se_avisa():
    bloques, avisos = mosaico.pdf_como_mosaico(_pdf(paginas=4))
    assert len(_imagenes(bloques)) == 5 * mosaico.MAXIMO_PAGINAS
    assert "4 páginas" in avisos[0]
    assert bloques[0]["text"].startswith("Página 1:")


def test_pdf_ilegible_devuelve_none():
    assert mosaico.pdf_como_mosaico(b"%PDF-1.7\n" + b"0" * 100) is None


def test_imagen_muy_pesada_se_envia_como_jpeg():
    ruido = Image.frombytes("RGB", (1568, 1109), os.urandom(1568 * 1109 * 3))
    bloque = mosaico._imagen(ruido)
    assert bloque["source"]["media_type"] == "image/jpeg"
    assert len(base64.b64decode(bloque["source"]["data"])) < 5_000_000


def test_dibujo_de_lineas_se_envia_como_png():
    bloques, _ = mosaico.pdf_como_mosaico(_pdf())
    assert all(b["source"]["media_type"] == "image/png" for b in _imagenes(bloques))
