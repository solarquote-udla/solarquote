"""
Boceto en PDF convertido en imágenes para la IA — RF-04.

Con planos exportados de AutoCAD, el PDF enviado como documento le llega al
modelo casi solo como texto (rótulos y números) y no ve la grilla de
paneles: en la prueba con el boceto real de San Pablo respondió "No pude
ver el dibujo" y supuso las medidas. Convertido en imágenes, el modelo sí
ve los bloques.

Cada página se envía como un mosaico:
- la página completa, para contar cuántos bloques hay de cada tipo (B);
- cuatro ampliaciones (cuadrantes con solape), para contar los paneles
  dentro de un bloque (L y A), que en la página completa son líneas
  demasiado juntas.

En la prueba con San Pablo, el mosaico contó bien B y L, y estimó A con más
confianza que la página sola. Si el PDF no se puede abrir (dañado o
protegido), se devuelve None y el servicio lo envía como documento, como
antes.
"""

from __future__ import annotations

import base64
import io

import pypdfium2 as pdfium
from PIL import Image

# Lado mayor con el que la API procesa una imagen sin reducirla
LADO_MAXIMO = 1568
# Solape entre cuadrantes, como fracción del lado: un bloque partido por el
# corte aparece completo en al menos una ampliación
SOLAPE = 0.08
# Un boceto suele ser una lámina; más páginas multiplican el costo
MAXIMO_PAGINAS = 3
# La API admite imágenes de hasta 5 MB; por encima de esto se usa JPEG
LIMITE_PNG_BYTES = 3_500_000

CUADRANTES = (
    ((0, 0), "superior izquierdo"),
    ((1, 0), "superior derecho"),
    ((0, 1), "inferior izquierdo"),
    ((1, 1), "inferior derecho"),
)

GUIA = (
    "Usa la página completa para contar cuántos bloques hay de cada tipo (B). Usa las ampliaciones solo para "
    "contar los paneles dentro de un bloque (L y A); no vuelvas a contar los bloques que aparecen en dos "
    "ampliaciones."
)


def _imagen(imagen: Image.Image) -> dict:
    buffer = io.BytesIO()
    imagen.save(buffer, format="PNG", optimize=True)
    media = "image/png"
    if buffer.tell() > LIMITE_PNG_BYTES:  # escaneos con mucho ruido: JPEG pesa mucho menos
        buffer = io.BytesIO()
        imagen.convert("RGB").save(buffer, format="JPEG", quality=90)
        media = "image/jpeg"
    return {"type": "image", "source": {"type": "base64", "media_type": media, "data": base64.b64encode(buffer.getvalue()).decode()}}


def _texto(texto: str) -> dict:
    return {"type": "text", "text": texto}


def _cuadrantes(imagen: Image.Image) -> list[tuple[str, Image.Image]]:
    ancho, alto = imagen.size
    partes = []
    for (columna, fila), nombre in CUADRANTES:
        caja = (
            int(max(0, columna * ancho / 2 - SOLAPE * ancho)),
            int(max(0, fila * alto / 2 - SOLAPE * alto)),
            int(min(ancho, (columna + 1) * ancho / 2 + SOLAPE * ancho)),
            int(min(alto, (fila + 1) * alto / 2 + SOLAPE * alto)),
        )
        partes.append((nombre, imagen.crop(caja)))
    return partes


def pdf_como_mosaico(contenido: bytes) -> tuple[list[dict], list[str]] | None:
    """
    Devuelve los bloques de contenido (texto + imagen) para la API y las
    advertencias para el usuario, o None si el PDF no se puede renderizar.
    """
    try:
        documento = pdfium.PdfDocument(contenido)
    except pdfium.PdfiumError:
        return None

    advertencias: list[str] = []
    total = len(documento)
    if total == 0:
        return None
    if total > MAXIMO_PAGINAS:
        advertencias.append(
            f"El PDF tiene {total} páginas: se analizaron las {MAXIMO_PAGINAS} primeras. "
            "Si los bloques están en otra página, carga solo esa lámina."
        )

    bloques: list[dict] = []
    for numero in range(min(total, MAXIMO_PAGINAS)):
        pagina = documento[numero]
        ancho, alto = pagina.get_size()
        lado = max(ancho, alto)
        prefijo = f"Página {numero + 1}: " if total > 1 else ""
        completa = pagina.render(scale=LADO_MAXIMO / lado).to_pil()
        bloques += [_texto(f"{prefijo}página completa del boceto:"), _imagen(completa)]
        # Ampliaciones al doble: cada cuadrante queda cerca del lado máximo
        grande = pagina.render(scale=2 * LADO_MAXIMO / lado).to_pil()
        for nombre, parte in _cuadrantes(grande):
            bloques += [_texto(f"{prefijo}ampliación del cuadrante {nombre} (con solape con los vecinos):"), _imagen(parte)]
    bloques.append(_texto(GUIA))
    documento.close()
    return bloques, advertencias
