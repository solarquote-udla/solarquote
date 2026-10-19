"""Bocetos DXF sintéticos para las pruebas, con medidas conocidas."""

import io
import math

import ezdxf

# Panel de 2278 × 1134 mm, en metros
LARGO, CORTO = 2.278, 1.134
HUECO = 0.02


def _girar(x: float, y: float, grados: float) -> tuple[float, float]:
    t = math.radians(grados)
    return x * math.cos(t) - y * math.sin(t), x * math.sin(t) + y * math.cos(t)


def crear_dxf(
    bloques: list[tuple[float, float, int, int]],
    *,
    angulo: float = 0.0,
    con_insert: bool = False,
    quitar: int = 0,
    extras: bool = True,
) -> bytes:
    """
    `bloques`: (x0, y0, L, A). El lado mayor del panel va sobre X (antes de
    girar), así que L se cuenta a lo largo de X y A a lo largo de Y.
    `quitar`: cuántos paneles borrar del último bloque (bloque incompleto).
    """
    doc = ezdxf.new("R2010")
    msp = doc.modelspace()
    if con_insert:
        panel = doc.blocks.new(name="PANEL")
        panel.add_lwpolyline([(0, 0), (LARGO, 0), (LARGO, CORTO), (0, CORTO)], close=True)

    for n, (x0, y0, L, A) in enumerate(bloques):
        posiciones = [(i, j) for i in range(L) for j in range(A)]
        if n == len(bloques) - 1 and quitar:
            posiciones = posiciones[:-quitar]
        for i, j in posiciones:
            x = x0 + i * (LARGO + HUECO)
            y = y0 + j * (CORTO + HUECO)
            if con_insert:
                gx, gy = _girar(x, y, angulo)
                msp.add_blockref("PANEL", (gx, gy), dxfattribs={"rotation": angulo})
            else:
                esquinas = [(x, y), (x + LARGO, y), (x + LARGO, y + CORTO), (x, y + CORTO)]
                msp.add_lwpolyline([_girar(px, py, angulo) for px, py in esquinas], close=True)

    if extras:
        # Contorno del terreno, un rótulo y una línea suelta: deben ignorarse
        msp.add_lwpolyline([_girar(*p, angulo) for p in [(-10, -10), (200, -10), (200, 160), (-10, 160)]], close=True)
        msp.add_text("BLOQUES DE LA 2 ETAPA", dxfattribs={"insert": (5, -5), "height": 1})
        msp.add_line((0, -8), (50, -8))

    flujo = io.StringIO()
    doc.write(flujo)
    return flujo.getvalue().encode("utf-8")
