"""
Lectura de bocetos DXF — RF-04, sin IA.

Un DXF trae la geometría exacta, así que no hace falta interpretarlo:
basta con encontrar los paneles y agruparlos en bloques.

1. Se recorren las entidades del espacio modelo, incluidos los bloques
   insertados (INSERT), y se toman los rectángulos: polilíneas cerradas de
   cuatro vértices con ángulos rectos. Las polilíneas 3D se proyectan al
   plano: en los planos reales de HEXtructure (Incubandina, Ecuahielos) el
   panel está dibujado inclinado, con cada esquina a su altura.
2. El panel es el rectángulo más repetido. Se descartan los que no tienen
   su tamaño (contorno del terreno, caminos, rótulos, marcos).
3. Se gira el dibujo para que el lado mayor del panel quede horizontal.
   En ese marco, los paneles pegados uno al lado del otro forman un bloque.
4. En cada bloque, las posiciones distintas a lo largo del lado mayor del
   panel son L y las posiciones distintas a lo ancho son A, igual que en la
   notación de HEXtructure (el panel va con su lado mayor en la dirección
   de L).
5. Un bloque escalonado (columnas de distinto largo, como los que siguen
   las curvas de nivel en Incubandina) se parte en bloques rectangulares:
   las columnas seguidas con las mismas filas forman un bloque.
6. Los bloques con el mismo L, A y orientación se agrupan como un tipo
   con su número de repeticiones (B).
7. Si los paneles están en zonas muy separadas (por ejemplo, la fase 1 y
   la fase 2 en el mismo plano), se avisa con los paneles de cada zona.
"""

import math
import os
import tempfile
from collections import Counter, defaultdict
from dataclasses import dataclass

from ezdxf import recover
from ezdxf.lldxf.const import DXFStructureError

from app.schemas.boceto import BloqueDetectado, ResultadoInterpretacion

# Un panel coincide con el tamaño dominante si sus lados difieren menos de esto
TOLERANCIA_TAMANO = 0.03
# Separación máxima entre paneles vecinos de un mismo bloque, como fracción
# del lado del panel en esa dirección
HUECO_MAXIMO_LARGO = 0.30
HUECO_MAXIMO_CORTO = 0.50
# Profundidad máxima de bloques anidados (INSERT dentro de INSERT)
PROFUNDIDAD_MAXIMA = 4
# Bloques a más de esta distancia entre sí están en zonas distintas del
# plano (fases o etapas), no separados por un pasillo o un camino.
SEPARACION_ZONAS_M = 40.0


class DxfIlegible(ValueError):
    """El archivo no se puede leer como DXF o no contiene paneles reconocibles."""


@dataclass(frozen=True)
class _Rect:
    cx: float
    cy: float
    largo: float
    corto: float
    angulo: float  # dirección del lado mayor, en grados, en [0, 180)


def _rectangulo(puntos: list[tuple[float, float]]) -> _Rect | None:
    """Rectángulo a partir de sus vértices, o None si no lo es."""
    if len(puntos) == 5 and math.dist(puntos[0], puntos[-1]) < 1e-9:
        puntos = puntos[:4]
    if len(puntos) != 4:
        return None
    p0, p1, p2, p3 = puntos
    a = (p1[0] - p0[0], p1[1] - p0[1])
    b = (p2[0] - p1[0], p2[1] - p1[1])
    la, lb = math.hypot(*a), math.hypot(*b)
    if la < 1e-9 or lb < 1e-9:
        return None
    # Ángulo recto y cuarto vértice donde debe estar
    if abs(a[0] * b[0] + a[1] * b[1]) > 1e-3 * la * lb:
        return None
    esperado = (p0[0] + b[0], p0[1] + b[1])
    if math.dist(esperado, p3) > 1e-3 * max(la, lb):
        return None
    largo_v, largo, corto = (a, la, lb) if la >= lb else (b, lb, la)
    angulo = math.degrees(math.atan2(largo_v[1], largo_v[0])) % 180
    cx = sum(p[0] for p in puntos) / 4
    cy = sum(p[1] for p in puntos) / 4
    return _Rect(cx, cy, largo, corto, angulo)


def _puntos(entidad) -> list[tuple[float, float]] | None:
    tipo = entidad.dxftype()
    if tipo == "LWPOLYLINE":
        puntos = [(x, y) for x, y in entidad.get_points("xy")]
        cerrada = entidad.closed or (len(puntos) > 1 and math.dist(puntos[0], puntos[-1]) < 1e-9)
        return puntos if cerrada else None
    if tipo == "POLYLINE" and (entidad.is_2d_polyline or entidad.is_3d_polyline):
        # Una polilínea 3D se proyecta al plano (se descarta la altura)
        puntos = [(v.dxf.location.x, v.dxf.location.y) for v in entidad.vertices]
        cerrada = entidad.is_closed or (len(puntos) > 1 and math.dist(puntos[0], puntos[-1]) < 1e-9)
        return puntos if cerrada else None
    if tipo in ("SOLID", "3DFACE"):
        if tipo == "SOLID":
            # El orden de los vértices de SOLID es 0, 1, 3, 2
            v = [entidad.dxf.vtx0, entidad.dxf.vtx1, entidad.dxf.vtx3, entidad.dxf.vtx2]
        else:
            v = [entidad.dxf.vtx0, entidad.dxf.vtx1, entidad.dxf.vtx2, entidad.dxf.vtx3]
        return [(p.x, p.y) for p in v]
    return None


def _recolectar(entidades, salida: list[_Rect], profundidad: int = 0) -> None:
    for entidad in entidades:
        if entidad.dxftype() == "INSERT":
            if profundidad < PROFUNDIDAD_MAXIMA:
                try:
                    _recolectar(entidad.virtual_entities(), salida, profundidad + 1)
                except Exception:  # noqa: BLE001 — un bloque roto no debe tumbar todo el archivo
                    continue
            continue
        puntos = _puntos(entidad)
        if puntos:
            rect = _rectangulo(puntos)
            if rect is not None:
                salida.append(rect)


def _clave_tamano(r: _Rect) -> tuple[int, int]:
    # Escala logarítmica: agrupa tamaños que difieren menos de ~0,5 %
    return round(math.log(r.largo) / 0.005), round(math.log(r.corto) / 0.005)


def _agrupar_en_bloques(paneles: list[tuple[float, float]], largo: float, corto: float) -> list[list[int]]:
    """Paneles vecinos (en el marco girado) unidos en bloques. Índices de `paneles`."""
    padre = list(range(len(paneles)))

    def raiz(i: int) -> int:
        while padre[i] != i:
            padre[i] = padre[padre[i]]
            i = padre[i]
        return i

    def unir(i: int, j: int) -> None:
        ri, rj = raiz(i), raiz(j)
        if ri != rj:
            padre[ri] = rj

    paso_x = largo * (1 + HUECO_MAXIMO_LARGO)
    paso_y = corto * (1 + HUECO_MAXIMO_CORTO)
    celdas: dict[tuple[int, int], list[int]] = defaultdict(list)
    for i, (x, y) in enumerate(paneles):
        celdas[(math.floor(x / paso_x), math.floor(y / paso_y))].append(i)

    for (cx, cy), indices in celdas.items():
        vecinos = [j for dx in (-1, 0, 1) for dy in (-1, 0, 1) for j in celdas.get((cx + dx, cy + dy), [])]
        for i in indices:
            xi, yi = paneles[i]
            for j in vecinos:
                if j <= i:
                    continue
                dx, dy = abs(paneles[j][0] - xi), abs(paneles[j][1] - yi)
                lado_a_lado = dy < corto * 0.5 and dx <= paso_x
                arriba_abajo = dx < largo * 0.5 and dy <= paso_y
                if lado_a_lado or arriba_abajo:
                    unir(i, j)

    grupos: dict[int, list[int]] = defaultdict(list)
    for i in range(len(paneles)):
        grupos[raiz(i)].append(i)
    return list(grupos.values())


def _indices(valores: list[float], lado: float) -> list[int]:
    """
    Posición (0, 1, 2…) de cada valor en la grilla de paneles. Los valores
    a menos de medio lado son la misma posición; el paso de la grilla es la
    distancia típica entre posiciones vecinas, así que un panel que falta
    deja un hueco en la numeración (y parte la columna en dos tramos).
    """
    ordenados = sorted(set(valores))
    centros = [[ordenados[0]]]
    for v in ordenados[1:]:
        if v - centros[-1][-1] > lado * 0.5:
            centros.append([v])
        else:
            centros[-1].append(v)
    medios = [sum(c) / len(c) for c in centros]
    pasos = sorted(b - a for a, b in zip(medios, medios[1:]) if b - a < lado * 1.5)
    paso = pasos[len(pasos) // 2] if pasos else lado
    def indice(v: float) -> int:
        return round((v - medios[0]) / paso)
    return [indice(v) for v in valores]


def rectangulos_de_grupo(posiciones: list[tuple[float, float]], largo: float, corto: float) -> list[tuple[int, int]]:
    """
    (L, A) de los bloques rectangulares que forman un grupo de paneles
    pegados. Un grupo completo es un solo bloque. Uno escalonado se parte:
    las columnas seguidas (a lo largo de L) con el mismo tramo de filas
    forman un bloque, y cada panel queda en uno solo.
    """
    columnas = _indices([x for x, _ in posiciones], largo)
    filas = _indices([y for _, y in posiciones], corto)
    por_columna: dict[int, set[int]] = defaultdict(set)
    for c, f in zip(columnas, filas):
        por_columna[c].add(f)

    def tramos(filas_columna: set[int]) -> list[tuple[int, int]]:
        ordenadas = sorted(filas_columna)
        resultado = [[ordenadas[0], ordenadas[0]]]
        for f in ordenadas[1:]:
            if f == resultado[-1][1] + 1:
                resultado[-1][1] = f
            else:
                resultado.append([f, f])
        return [(a, b) for a, b in resultado]

    bloques: list[tuple[int, int]] = []
    abiertos: dict[tuple[int, int], int] = {}  # tramo de filas → columnas seguidas
    anterior = None
    for c in sorted(por_columna):
        actuales = set(tramos(por_columna[c]))
        seguida = anterior is not None and c == anterior + 1
        for tramo, n in list(abiertos.items()):
            if not seguida or tramo not in actuales:
                bloques.append((n, tramo[1] - tramo[0] + 1))
                del abiertos[tramo]
        for tramo in actuales:
            abiertos[tramo] = abiertos.get(tramo, 0) + 1
        anterior = c
    bloques.extend((n, tramo[1] - tramo[0] + 1) for tramo, n in abiertos.items())
    return bloques


def _zonas(cajas: list[tuple[float, float, float, float, int]]) -> list[int]:
    """Paneles de cada zona del plano (bloques a menos de SEPARACION_ZONAS_M), de mayor a menor."""
    padre = list(range(len(cajas)))

    def raiz(i: int) -> int:
        while padre[i] != i:
            padre[i] = padre[padre[i]]
            i = padre[i]
        return i

    for i, a in enumerate(cajas):
        for j in range(i + 1, len(cajas)):
            b = cajas[j]
            dx = max(a[0] - b[2], b[0] - a[2], 0)
            dy = max(a[1] - b[3], b[1] - a[3], 0)
            if math.hypot(dx, dy) < SEPARACION_ZONAS_M:
                padre[raiz(i)] = raiz(j)
    paneles: Counter = Counter()
    for i, caja in enumerate(cajas):
        paneles[raiz(i)] += caja[4]
    return sorted(paneles.values(), reverse=True)


def _letra(indice: int) -> str:
    letras = ""
    indice += 1
    while indice:
        indice, resto = divmod(indice - 1, 26)
        letras = chr(65 + resto) + letras
    return letras


class SinPaneles(ValueError):
    """En los rectángulos no hay paneles, o solo hay paneles sueltos (args[0]: "sin paneles" o "solo sueltos")."""


def bloques_desde_rectangulos(rects: list[_Rect]) -> tuple[list[BloqueDetectado], list[str]]:
    """
    Pasos 2 a 5 del módulo: del conjunto de rectángulos del dibujo a los
    tipos de bloque (L, A, B) con sus advertencias. Lo usan el DXF y la
    lectura por geometría del PDF (pdf_vectorial.py).
    """
    rects = [r for r in rects if r.largo / r.corto > 1.05]  # un panel nunca es cuadrado
    if not rects:
        raise SinPaneles("sin paneles")

    tamano, _ = Counter(_clave_tamano(r) for r in rects).most_common(1)[0]
    base = next(r for r in rects if _clave_tamano(r) == tamano)
    paneles = [
        r
        for r in rects
        if abs(r.largo - base.largo) / base.largo < TOLERANCIA_TAMANO
        and abs(r.corto - base.corto) / base.corto < TOLERANCIA_TAMANO
    ]

    # Girar para que el lado mayor del panel quede sobre el eje X
    angulo = Counter(round(r.angulo) % 180 for r in paneles).most_common(1)[0][0]
    def diferencia(a: float) -> float:
        d = abs(a - angulo) % 180
        return min(d, 180 - d)

    girados_aparte = sum(1 for r in paneles if diferencia(r.angulo) > 5)
    paneles = [r for r in paneles if diferencia(r.angulo) <= 5]
    # Un panel copiado encima de otro (en la misma posición, a 2 cm) se
    # cuenta una sola vez y se avisa: al partir los bloques escalonados ya
    # no saltaría el aviso de grilla incompleta (revisión del #108).
    unicos: dict[tuple[int, int], _Rect] = {}
    for r in paneles:
        unicos.setdefault((round(r.cx / 0.02), round(r.cy / 0.02)), r)
    repetidos = len(paneles) - len(unicos)
    paneles = list(unicos.values())
    theta = math.radians(-angulo)
    cos_t, sin_t = math.cos(theta), math.sin(theta)
    girados = [(r.cx * cos_t - r.cy * sin_t, r.cx * sin_t + r.cy * cos_t) for r in paneles]

    advertencias: list[str] = []
    descartados = len(rects) - len(paneles) - repetidos
    tipos: Counter = Counter()
    sueltos = 0
    escalonados = 0
    partes_escalonadas = 0
    cajas: list[tuple[float, float, float, float, int]] = []
    angulos_grupos: list[float] = []
    # A corre perpendicular al lado mayor del panel: vertical si ese lado es horizontal
    orientacion = "vertical" if abs(math.cos(math.radians(angulo))) >= math.sqrt(0.5) else "horizontal"

    for grupo in _agrupar_en_bloques(girados, base.largo, base.corto):
        if len(grupo) < 2:
            sueltos += 1
            continue
        xs = [girados[i][0] for i in grupo]
        ys = [girados[i][1] for i in grupo]
        cajas.append((min(xs), min(ys), max(xs), max(ys), len(grupo)))
        # Cada bloque se cuenta con su propio giro: en un mismo plano hay
        # bloques girados apenas distinto (Ecuahielos: 63,8° a 65°), y un
        # grado de diferencia en un bloque de 40 m corre las filas casi un
        # metro si se cuenta con el giro de otro.
        giro_grupo = sorted(paneles[i].angulo for i in grupo)[len(grupo) // 2]
        angulos_grupos.append(giro_grupo)
        t = math.radians(-giro_grupo)
        propios = [
            (paneles[i].cx * math.cos(t) - paneles[i].cy * math.sin(t), paneles[i].cx * math.sin(t) + paneles[i].cy * math.cos(t))
            for i in grupo
        ]
        partes = rectangulos_de_grupo(propios, base.largo, base.corto)
        if len(partes) > 1:
            escalonados += 1
            partes_escalonadas += len(partes)
        for L, A in partes:
            tipos[(L, A)] += 1

    if not tipos:
        raise SinPaneles("solo sueltos")

    orden = sorted(tipos.items(), key=lambda item: (-item[1], -item[0][1], -item[0][0]))
    bloques = [
        BloqueDetectado(
            etiqueta=_letra(i),
            paneles_largo=L,
            paneles_ancho=A,
            repeticiones=b,
            orientacion=orientacion,
        )
        for i, ((L, A), b) in enumerate(orden)
    ]

    if girados_aparte:
        advertencias.append(
            f"Se ignoraron {girados_aparte} paneles dibujados con otra orientación que el resto; "
            f"agrégalos a mano en la confirmación si corresponden."
        )
    if repetidos:
        advertencias.append(
            f"Se ignoraron {repetidos} paneles repetidos en la misma posición (copiados encima de otro "
            f"en el plano)."
        )
    if descartados:
        advertencias.append(
            f"Se ignoraron {descartados} rectángulos que no tienen el tamaño de un panel "
            f"(contornos, caminos o rótulos)."
        )
    if sueltos:
        advertencias.append(f"Se ignoraron {sueltos} paneles sueltos que no forman un bloque.")
    if escalonados:
        advertencias.append(
            f"{escalonados} bloque(s) escalonados (columnas de distinto largo) se partieron en "
            f"{partes_escalonadas} bloques rectangulares para cotizarlos. Revisa en la confirmación "
            f"si corresponde cotizarlos así."
        )
    if angulos_grupos and max(angulos_grupos) - min(angulos_grupos) > 0.5:
        advertencias.append(
            f"Hay bloques dibujados con giros distintos ({min(angulos_grupos):.1f}° a "
            f"{max(angulos_grupos):.1f}°): puede que el plano tenga varias fases o etapas. Se "
            f"cotizaron todos; si solo corresponde una fase, ajusta las cantidades en la confirmación."
        )
    zonas = _zonas(cajas)
    if len(zonas) > 1:
        detalle = ", ".join(f"zona {i + 1}: {n} paneles" for i, n in enumerate(zonas))
        advertencias.append(
            f"Los paneles están en {len(zonas)} zonas separadas por más de {SEPARACION_ZONAS_M:g} m "
            f"({detalle}), por ejemplo fases distintas del proyecto. Se cotizaron todas; si solo "
            f"corresponde una, quita las demás en la confirmación."
        )
    impares = sorted({b.paneles_largo for b in bloques if b.paneles_largo % 2})
    if impares:
        advertencias.append(
            f"Hay bloques con L impar ({', '.join(map(str, impares))}): la estructura apoya los paneles "
            f"de a dos. Corrígelos en la confirmación."
        )

    return bloques, advertencias


def interpretar_dxf(contenido: bytes) -> ResultadoInterpretacion:
    ruta = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".dxf", delete=False) as tmp:
            tmp.write(contenido)
            ruta = tmp.name
        documento, _auditor = recover.readfile(ruta)
    except (DXFStructureError, OSError, UnicodeDecodeError) as exc:
        raise DxfIlegible("No se pudo leer el archivo DXF. Vuelve a exportarlo desde AutoCAD.") from exc
    finally:
        if ruta and os.path.exists(ruta):
            os.remove(ruta)

    rects: list[_Rect] = []
    _recolectar(documento.modelspace(), rects)
    try:
        bloques, advertencias = bloques_desde_rectangulos(rects)
    except SinPaneles as exc:
        if exc.args[0] == "solo sueltos":
            raise DxfIlegible("Se encontraron paneles sueltos, pero ningún bloque de dos o más paneles.") from exc
        raise DxfIlegible(
            "No se encontraron paneles en el DXF. Cada panel debe estar dibujado como una polilínea "
            "cerrada o como un bloque insertado."
        ) from exc
    return ResultadoInterpretacion(formato="dxf", metodo="dxf", bloques=bloques, advertencias=advertencias)
