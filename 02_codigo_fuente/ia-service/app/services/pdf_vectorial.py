"""
Lectura de bocetos PDF por geometría — RF-04, sin IA.

Un PDF exportado de AutoCAD conserva los paneles como trazos vectoriales:
cada panel es un rectángulo pequeño, a veces dibujado con un operador de
rectángulo y a veces como tramos de polilínea. Si se encuentran esos
rectángulos, el boceto se lee igual que un DXF (bloques_desde_rectangulos
de dxf.py), con conteos exactos. En la prueba con el boceto real de San
Pablo dio 4×28 ×20... y 4.704 paneles, igual que el conteo a mano, donde la
IA con imágenes estimaba A=26.

Si no hay rectángulos de panel (PDF escaneado, plano girado, paneles como
imagen), devuelve None y el servicio usa la IA con el mosaico de imágenes.

Cómo se encuentran los paneles:
1. Se toman todos los tramos rectos del dibujo y se quedan los horizontales
   y verticales.
2. El largo de tramo horizontal más repetido y el vertical más repetido son
   los lados del panel (deben tener proporción de panel: entre 1,3 y 3).
3. Un panel es un par de tramos horizontales de ese largo, alineados, a la
   distancia del lado vertical. Se descartan los repetidos (un mismo panel
   dibujado dos veces, o con tramos partidos).
"""

from __future__ import annotations

import bisect
import io
from collections import Counter, defaultdict

import pdfplumber
from pdfminer.pdfparser import PDFSyntaxError
from pdfplumber.utils.exceptions import PdfminerException

from app.schemas.boceto import BloqueDetectado, ResultadoInterpretacion
from app.services.dxf import SinPaneles, _Rect, bloques_desde_rectangulos

# Un tramo es horizontal o vertical si se desvía menos que esto (puntos PDF)
DESVIO_EJE = 0.02
# Tramos más cortos que esto son uniones o remates del dibujo, no lados
TRAMO_MINIMO = 0.5
# Proporción largo / corto de un panel fotovoltaico (2278 × 1134 mm ≈ 2)
PROPORCION_MINIMA, PROPORCION_MAXIMA = 1.3, 3.0
# PDF que pdfminer no puede leer (dañado, protegido o no es PDF): se pasa a la IA
PDF_ILEGIBLE = (PdfminerException, PDFSyntaxError, ValueError, TypeError, KeyError)
# Con menos paneles que esto no se considera un plano de paneles
PANELES_MINIMOS = 4
MAXIMO_PAGINAS = 3


def _tramos(pagina):
    """Tramos rectos (a, b) del dibujo: líneas, polilíneas y rectángulos."""
    for objeto in pagina.curves + pagina.lines:
        puntos = objeto.get("pts") or []
        yield from zip(puntos, puntos[1:])
    for r in pagina.rects:
        x0, x1, arriba, abajo = r["x0"], r["x1"], r["top"], r["bottom"]
        yield (x0, arriba), (x1, arriba)
        yield (x0, abajo), (x1, abajo)
        yield (x0, arriba), (x0, abajo)
        yield (x1, arriba), (x1, abajo)


def _rectangulos_de_panel(pagina) -> list[_Rect]:
    horizontales: list[tuple[float, float, float]] = []  # (centro x, y, largo)
    verticales: list[float] = []  # largos
    for (x0, y0), (x1, y1) in _tramos(pagina):
        if abs(y0 - y1) < DESVIO_EJE and abs(x1 - x0) > TRAMO_MINIMO:
            horizontales.append(((x0 + x1) / 2, y0, abs(x1 - x0)))
        elif abs(x0 - x1) < DESVIO_EJE and abs(y1 - y0) > TRAMO_MINIMO:
            verticales.append(abs(y1 - y0))
    if not horizontales or not verticales:
        return []

    ancho = Counter(round(largo, 1) for *_, largo in horizontales).most_common(1)[0][0]
    alto = Counter(round(largo, 1) for largo in verticales).most_common(1)[0][0]
    if not PROPORCION_MINIMA <= max(ancho, alto) / min(ancho, alto) <= PROPORCION_MAXIMA:
        return []

    # Pares de tramos horizontales del ancho del panel, uno sobre otro a la distancia del alto
    aristas = [(cx, y) for cx, y, largo in horizontales if abs(largo - ancho) / ancho < 0.04]
    por_columna: dict[int, list[float]] = defaultdict(list)
    for cx, y in aristas:
        por_columna[round(cx / (ancho / 4))].append(y)
    for ys in por_columna.values():
        ys.sort()

    centros: list[tuple[float, float]] = []
    vistos: dict[tuple[int, int], list[tuple[float, float]]] = defaultdict(list)
    for cx, y in aristas:
        columna = round(cx / (ancho / 4))
        for c in (columna - 1, columna, columna + 1):
            ys = por_columna.get(c, [])
            i = bisect.bisect_left(ys, y + alto * 0.9)
            if i < len(ys) and ys[i] <= y + alto * 1.1:
                # pdfplumber mide y hacia abajo: se invierte para que crezca hacia arriba, como en el DXF
                x, yc = cx, -(y + ys[i]) / 2
                celda = (round(x / ancho), round(yc / alto))
                repetido = any(
                    abs(x - a) < 0.3 * ancho and abs(yc - b) < 0.3 * alto
                    for dx in (-1, 0, 1)
                    for dy in (-1, 0, 1)
                    for a, b in vistos[(celda[0] + dx, celda[1] + dy)]
                )
                if not repetido:
                    vistos[celda].append((x, yc))
                    centros.append((x, yc))
                break

    largo, corto = max(ancho, alto), min(ancho, alto)
    angulo = 0.0 if ancho >= alto else 90.0  # dirección del lado mayor
    return [_Rect(x, y, largo, corto, angulo) for x, y in centros]


def _leer(contenido: bytes) -> tuple[Counter, dict[tuple[int, int], str], list[str]]:
    tipos: Counter = Counter()
    orientaciones: dict[tuple[int, int], str] = {}
    advertencias: list[str] = []
    with pdfplumber.open(io.BytesIO(contenido)) as documento:
        for pagina in documento.pages[:MAXIMO_PAGINAS]:
            rects = _rectangulos_de_panel(pagina)
            if len(rects) < PANELES_MINIMOS:
                continue
            try:
                bloques, avisos = bloques_desde_rectangulos(rects)
            except SinPaneles:
                continue
            for b in bloques:
                tipos[(b.paneles_largo, b.paneles_ancho)] += b.repeticiones
                orientaciones[(b.paneles_largo, b.paneles_ancho)] = b.orientacion
            advertencias += [a for a in avisos if a not in advertencias]
        if len(documento.pages) > MAXIMO_PAGINAS and tipos:
            advertencias.append(
                f"El PDF tiene {len(documento.pages)} páginas: se leyeron las {MAXIMO_PAGINAS} primeras."
            )
    return tipos, orientaciones, advertencias


def interpretar_pdf_vectorial(contenido: bytes) -> ResultadoInterpretacion | None:
    """El boceto leído de la geometría del PDF, o None si no trae paneles dibujados como vectores."""
    try:
        tipos, orientaciones, advertencias = _leer(contenido)
    except PDF_ILEGIBLE:
        return None

    if not tipos:
        return None

    orden = sorted(tipos.items(), key=lambda item: (-item[1], -item[0][1], -item[0][0]))
    bloques = [
        BloqueDetectado(
            etiqueta=chr(65 + i) if i < 26 else None,
            paneles_largo=L,
            paneles_ancho=A,
            repeticiones=b,
            orientacion=orientaciones[(L, A)],
        )
        for i, ((L, A), b) in enumerate(orden)
    ]
    advertencias.insert(0, "Leído de la geometría del PDF, sin IA: los paneles están dibujados como vectores.")
    return ResultadoInterpretacion(formato="pdf", metodo="pdf", bloques=bloques, advertencias=advertencias)
