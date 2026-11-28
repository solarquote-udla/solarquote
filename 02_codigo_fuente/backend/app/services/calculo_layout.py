"""
Generación del layout solar — RF-03.

Funciones puras, sin base de datos: reciben polígonos y números, devuelven
bloques. Así se prueban con terrenos cuyo óptimo se calcula a mano.

Modelo del bloque
-----------------
Se sigue la notación de HEXtructure (cotización EMIHANA: L=4, A=28):

    L  paneles en el "largo" del bloque — la dirección de la pendiente.
       Siempre par: la estructura apoya los paneles de a dos sobre
       soportes en A y en V.
    A  paneles en el "ancho" del bloque — la dirección larga, a lo largo
       de las filas.

El panel va con su lado mayor en la dirección de L. Entre panel y panel
queda una separación: a lo largo (entre las filas de la pendiente) y a lo
ancho (el clamp intermedio). En metros:

    largo_m = L · lado_mayor + (L − 1) · sep_largo
    ancho_m = A · lado_menor + (A − 1) · sep_ancho

L y A los elige el Gerente: dependen del cliente, del terreno y de cuántos
paneles conecta a cada MPPT del inversor (revisión con HEXtructure del
17 de noviembre de 2026: 8 × 13, 8 × 24, 10 × 28, 22 × 28, 2 × 30). Sin A,
se usa el bloque compacto.

Bloque compacto (antisísmico): A = 3 · L, contado en paneles (4 × 12,
8 × 24, 2 × 6). Es una recomendación de HEXtructure, no una regla: los
bloques que se aparten más de la tolerancia (±20 % por defecto) se marcan
como no compactos y se avisa, pero no se descartan.

Orientación
-----------
Las filas (dirección de A) corren de norte a sur y la pendiente (L) va de
este a oeste, como en el plano de San Pablo del Lago. `orientacion_norte`
del terreno indica hacia dónde apunta el norte, en grados medidos en
sentido horario desde el eje +Y del canvas. Si no está definida, se toma
el eje +Y como norte y se advierte.

Los bloques también se pueden alinear con el terreno, como en los planos
reales de HEXtructure (Envasur, Ecuahielos): se aprovecha mejor el área a
cambio de una orientación distinta a la del norte. Para cada dirección de
lado del terreno se prueban las dos posiciones del bloque, con las filas a
lo largo del lado y de través, y se queda la que ubica más paneles. Las
dos orientaciones se calculan siempre, para avisar cuál conviene.

Algoritmo
---------
1. Área útil = terreno − unión de caminos.
2. Se rota el área útil para que el norte quede hacia +Y.
3. Se recorre el ancho del terreno en franjas verticales del ancho de un
   bloque, separadas por el pasillo este-oeste.
4. En cada franja se calculan los tramos verticales libres: aquellos en
   los que la franja completa cae dentro del área útil. La proyección de
   cada obstáculo conexo sobre el eje Y es un intervalo, así que el
   cálculo es exacto, no un muestreo.
5. Cada tramo se llena desde abajo con bloques completos separados por
   el pasillo norte-sur. Lo que sobra al final del tramo se aprovecha
   con un bloque más corto (menos paneles en A), que suele quedar fuera
   de proporción y por eso sale en ámbar. Si ese bloque corto tendría
   menos paneles en A que el "A mínimo" del Gerente, no se genera: así
   no quedan bloques de una o dos filas que luego hay que borrar a mano
   (SQ-170).
6. Como el resultado depende de dónde arranca la primera franja, se
   prueban varios desfases y se queda el que ubica más paneles.

Dentro de un tramo, llenar desde el inicio es óptimo para una sola
dimensión; el único grado de libertad real es el desfase horizontal, y
por eso es el que se busca.

Separaciones
------------
Norte-sur: el pasillo. Este-oeste: el mayor entre el pasillo y la sombra
que proyecta un bloque inclinado (fórmula de RF-02, tomando toda la
profundidad L como un plano). En Ecuador, con el sol alto, la sombra casi
nunca supera los 2 m del pasillo, pero se calcula igual para que el
criterio quede explícito.
"""

import math
from bisect import bisect_left
from collections.abc import Sequence
from dataclasses import dataclass, field
from itertools import accumulate

from shapely.affinity import rotate
from shapely import STRtree
from shapely.geometry import Point, Polygon, box
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union

from app.services.calculo_equipo import limites_string, separacion_entre_filas

# Bloque compacto (antisísmico): A = 3 · L, en paneles.
RELACION_OBJETIVO = 3.0

TOLERANCIA_DEFECTO = 0.20
PASILLO_DEFECTO_M = 2.0
PANELES_LARGO_DEFECTO = 4
# Separación entre paneles dentro del bloque, en metros (HEXtructure,
# 17 de noviembre de 2026): 6 cm a lo largo, entre las filas de la
# pendiente, y 2 cm a lo ancho, donde va el clamp intermedio. Las
# funciones puras parten de 0 (bloque sin separaciones) para que un
# layout generado antes de este cambio se pueda reconstruir igual; la
# API usa estos valores.
SEPARACION_LARGO_DEFECTO_M = 0.06
SEPARACION_ANCHO_DEFECTO_M = 0.02
# A mínimo de los bloques cortos. 1 = sin mínimo (todo lo que entra se
# aprovecha), igual que antes de SQ-170. El valor que usará HEXtructure
# por defecto está pendiente de confirmar con el Gerente General.
PANELES_ANCHO_MINIMO_DEFECTO = 1

# Al recortar a la capacidad deseada, el último bloque nunca queda más
# angosto que esto, aunque "A mínimo" esté en 1 o 2: una estructura de
# soporte independiente de 1 o 2 paneles no es construible en la
# práctica, aunque la potencia instalada cuadre exacto (revisión de UX
# del 21 de noviembre de 2026, con el caso real de un terreno con camino
# y capacidad deseada que generaba un bloque de 4 × 1). Se prefiere
# instalar unos paneles de más, igual que ya hace "A mínimo" con el
# sobrante de un tramo (SQ-170) — esto es lo mismo, pero como piso fijo
# para que no haga falta subir "A mínimo" a mano cada vez. No aplica al
# resto del layout: maximizar paneles (sin capacidad deseada) sigue
# aprovechando el sobrante de un tramo tal como lo deje "A mínimo".
PANELES_ANCHO_MINIMO_RECORTE = 3

# Cuántos puntos de arranque se prueban para la primera franja. 24 deja el
# error de discretización por debajo del 5 % del paso horizontal, que es
# el margen que pide RNF-01.
DESFASES = 24

# Tolerancia geométrica en metros. Evita que un bloque apoyado justo en el
# borde se descarte por ruido de punto flotante.
_EPS = 1e-6

# Por debajo de esto un obstáculo es ruido numérico, no superficie.
_AREA_MINIMA = 1e-6


class LayoutImposible(ValueError):
    """No entra ningún bloque. El mensaje explica por qué y qué probar."""


# ─── Entradas ───────────────────────────────────────────────────────


@dataclass(frozen=True)
class PanelLayout:
    """Lo único del panel que el algoritmo necesita."""

    largo_mm: float
    ancho_mm: float
    potencia_wp: float
    angulo_montaje: float


@dataclass(frozen=True)
class InversorLayout:
    """Datos eléctricos del inversor. Todos opcionales, como en RF-02."""

    vmax_v: float | None = None
    vmin_v: float | None = None
    mppts: int | None = None
    strings_por_mppt: int | None = None


@dataclass(frozen=True)
class ParametrosLayout:
    paneles_largo: int = PANELES_LARGO_DEFECTO
    pasillo_m: float = PASILLO_DEFECTO_M
    tolerancia_proporcion: float = TOLERANCIA_DEFECTO
    capacidad_deseada_kwp: float | None = None
    paneles_ancho_minimo: int = PANELES_ANCHO_MINIMO_DEFECTO
    # A del bloque completo. None = bloque compacto (A = 3 · L).
    paneles_ancho: int | None = None
    separacion_largo_m: float = 0.0
    separacion_ancho_m: float = 0.0


# ─── Salidas ────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Bloque:
    # Cuatro esquinas en coordenadas del terreno, en sentido antihorario.
    vertices: list[list[float]]
    paneles_largo: int
    paneles_ancho: int
    proporcion: float
    en_proporcion: bool
    tipo: str = ""

    @property
    def paneles(self) -> int:
        return self.paneles_largo * self.paneles_ancho


@dataclass(frozen=True)
class TipoBloque:
    """Bloques idénticos agrupados, como en los bocetos: 'Bloque A × 12'."""

    tipo: str
    paneles_largo: int
    paneles_ancho: int
    repeticiones: int
    proporcion: float
    en_proporcion: bool

    @property
    def paneles(self) -> int:
        return self.paneles_largo * self.paneles_ancho * self.repeticiones


@dataclass(frozen=True)
class Capacidad:
    deseada_kwp: float
    paneles_necesarios: int
    cabe: bool
    maxima_kwp: float
    instalada_kwp: float
    remanente_kwp: float


@dataclass(frozen=True)
class ElectricaInversor:
    """Strings de un inversor con los paneles de los bloques que tiene asignados."""

    paneles_por_string_min: int | None
    paneles_por_string_max: int | None
    paneles_por_string: int | None
    strings: int | None
    paneles_sin_string: int | None
    strings_por_mppt: int | None
    compatible: bool | None
    motivo: str | None


@dataclass(frozen=True)
class ResultadoLayout:
    bloques: list[Bloque]
    tipos: list[TipoBloque]
    total_paneles: int
    potencia_kwp: float
    paneles_ancho_ideal: int
    largo_bloque_m: float
    ancho_bloque_m: float
    separacion_este_oeste_m: float
    separacion_norte_sur_m: float
    area_util_m2: float
    area_ocupada_m2: float
    capacidad: Capacidad | None
    advertencias: list[str] = field(default_factory=list)
    # Necesarios para editar bloques después (SQ-64): con la orientación
    # y el ancho de un panel, un bloque se reconstruye a partir de su
    # esquina suroeste y su A. Es el giro de los bloques: el norte, o el
    # norte más el giro hacia el lado elegido.
    angulo_norte: float = 0.0
    lado_menor_m: float = 0.0
    separacion_largo_m: float = 0.0
    separacion_ancho_m: float = 0.0
    # El bloque completo cumple A = 3 · L dentro de la tolerancia.
    bloque_compacto: bool = True
    # Orientación usada y paneles que entran con cada una (para sugerir)
    orientacion_bloques: str = "norte"
    paneles_norte: int = 0
    paneles_terreno: int = 0


# ─── Geometría del bloque ───────────────────────────────────────────


def construir_bloque(
    origen: tuple[float, float],
    largo_planta_m: float,
    ancho_m: float,
    angulo_norte: float,
) -> Polygon:
    """
    Rectángulo del bloque en coordenadas del terreno.

    `origen` es la esquina suroeste. Se lleva al marco local (norte hacia
    +Y), se arma el rectángulo alineado a los ejes y se devuelve girado
    al terreno. Es la misma construcción que usa `generar_layout`, así
    que un bloque generado y uno editado tienen la misma forma y el mismo
    orden de vértices: [SE, NE, NO, SO].
    """
    ox, oy = rotate(Point(origen), angulo_norte, origin=(0, 0)).coords[0]
    local = box(ox, oy, ox + largo_planta_m, oy + ancho_m)
    return rotate(local, -angulo_norte, origin=(0, 0))


def vertices_de(poligono: Polygon) -> list[list[float]]:
    """Cuatro esquinas redondeadas al milímetro, sin repetir la primera."""
    return [[round(x, 3), round(y, 3)] for x, y in list(poligono.exterior.coords)[:-1]]


def paneles_ancho_ideal(paneles_largo: int) -> int:
    """A del bloque compacto: 3 · L (4 × 12, 8 × 24, 2 × 6)."""
    return max(1, round(RELACION_OBJETIVO * paneles_largo))


def proporcion_bloque(paneles_largo: int, paneles_ancho: int) -> float:
    """A / L, en paneles. El bloque compacto da 3."""
    return paneles_ancho / paneles_largo


def medida_fila(paneles: int, lado_m: float, separacion_m: float) -> float:
    """Medida de una fila de paneles con su separación: n · lado + (n − 1) · sep."""
    return paneles * lado_m + max(0, paneles - 1) * separacion_m


def paneles_que_entran(medida_m: float, lado_m: float, separacion_m: float) -> int:
    """Cuántos paneles caben en una medida, con la separación entre ellos."""
    return math.floor((medida_m + separacion_m) / (lado_m + separacion_m) + _EPS)


def cumple_proporcion(proporcion: float, tolerancia: float) -> bool:
    return abs(proporcion / RELACION_OBJETIVO - 1) <= tolerancia + _EPS


# ─── Tramos libres de una franja ────────────────────────────────────


def _poligonos(geometria: BaseGeometry) -> list[Polygon]:
    """Partes con área de cualquier geometría que devuelva Shapely."""
    if geometria.is_empty:
        return []
    if isinstance(geometria, Polygon):
        return [geometria] if geometria.area > _AREA_MINIMA else []
    partes = getattr(geometria, "geoms", [])
    return [p for g in partes for p in _poligonos(g)]


def _tramos_libres(
    util: BaseGeometry,
    x0: float,
    x1: float,
    y_min: float,
    y_max: float,
) -> list[tuple[float, float]]:
    """
    Intervalos de Y donde el rectángulo [x0, x1] × [y, y'] cabe entero.

    Lo que no es área útil dentro de la franja son obstáculos. Cada
    obstáculo conexo proyecta un intervalo continuo sobre Y, y en toda
    esa altura la franja completa queda bloqueada. Lo que no cubre
    ninguna proyección está libre.
    """
    franja = box(x0 + _EPS, y_min - 1, x1 - _EPS, y_max + 1)
    obstaculos = sorted(
        (p.bounds[1], p.bounds[3]) for p in _poligonos(franja.difference(util))
    )

    tramos: list[tuple[float, float]] = []
    cursor = y_min - 1
    for inicio, fin in obstaculos:
        if inicio > cursor:
            tramos.append((cursor, inicio))
        cursor = max(cursor, fin)
    if cursor < y_max + 1:
        tramos.append((cursor, y_max + 1))
    return tramos


@dataclass(frozen=True)
class _BloqueLocal:
    """Bloque en el marco rotado (norte hacia +Y), antes de volver al terreno."""

    x0: float
    y0: float
    x1: float
    y1: float
    paneles_ancho: int


def _llenar_tramo(
    inicio: float,
    fin: float,
    alto_bloque: float,
    lado_menor_m: float,
    separacion: float,
    paneles_ancho: int,
    paneles_ancho_minimo: int = 1,
    separacion_paneles_m: float = 0.0,
) -> list[tuple[float, float, int]]:
    """
    Bloques que entran en un tramo vertical: (y_inicio, y_fin, A).

    Completos primero; con lo que sobra, uno más corto si entran al
    menos `paneles_ancho_minimo` paneles en A.
    """
    resultado = []
    y = inicio
    while y + alto_bloque <= fin + _EPS:
        resultado.append((y, y + alto_bloque, paneles_ancho))
        y += alto_bloque + separacion

    sobrante = fin - y
    a_corto = min(paneles_ancho - 1, paneles_que_entran(sobrante, lado_menor_m, separacion_paneles_m))
    if a_corto >= max(1, paneles_ancho_minimo):
        resultado.append((y, y + medida_fila(a_corto, lado_menor_m, separacion_paneles_m), a_corto))
    return resultado


def _distribuir(
    util: BaseGeometry,
    desfase: float,
    ancho_franja: float,
    paso_x: float,
    alto_bloque: float,
    lado_menor_m: float,
    separacion_y: float,
    paneles_ancho: int,
    paneles_ancho_minimo: int = 1,
    separacion_paneles_m: float = 0.0,
) -> list[_BloqueLocal]:
    minx, miny, maxx, maxy = util.bounds
    bloques: list[_BloqueLocal] = []

    x = minx + desfase
    while x + ancho_franja <= maxx + _EPS:
        for inicio, fin in _tramos_libres(util, x, x + ancho_franja, miny, maxy):
            for y0, y1, a in _llenar_tramo(
                inicio,
                fin,
                alto_bloque,
                lado_menor_m,
                separacion_y,
                paneles_ancho,
                paneles_ancho_minimo,
                separacion_paneles_m,
            ):
                bloques.append(_BloqueLocal(x, y0, x + ancho_franja, y1, a))
        x += paso_x

    return bloques


# ─── Capacidad y eléctrica ──────────────────────────────────────────


def _recortar_a_capacidad(
    bloques: list[_BloqueLocal],
    paneles_necesarios: int,
    paneles_largo: int,
    lado_menor_m: float,
    paneles_ancho_minimo: int = 1,
    separacion_paneles_m: float = 0.0,
) -> list[_BloqueLocal]:
    """
    Se queda con los bloques justos para la capacidad pedida.

    Elige primero los bloques completos (los de más paneles en A) y, entre
    ellos, los más cercanos al centro de la planta; después los demás, con
    el mismo criterio. Así la planta queda junta en el centro y los
    bloques cortos que sobran en las puntas del terreno solo entran si
    hacen falta (revisión del 21 de noviembre: con un terreno girado, el
    orden de izquierda a derecha llenaba primero la punta angosta con
    bloques no compactos y dejaba vacío el resto).

    El último bloque se acorta para no pasarse más de una fila de L, pero
    nunca por debajo del A mínimo ni de PANELES_ANCHO_MINIMO_RECORTE. Un
    candidato que ya nace más angosto que ese piso (un sobrante de tramo
    del paso de maximizar, sin relación con la capacidad pedida) se salta
    en vez de instalarlo: en cualquiera de los dos casos se prefieren unos
    paneles de más antes que una estructura de soporte independiente para
    un puñado de paneles, que no sería real aunque la cuenta cuadre.
    """
    piso = max(1, paneles_ancho_minimo, PANELES_ANCHO_MINIMO_RECORTE)
    candidatos = [b for b in bloques if b.paneles_ancho >= piso]
    if not candidatos:
        return []

    completo = max(b.paneles_ancho for b in candidatos)
    peso = sum(b.paneles_ancho for b in candidatos)
    cx = sum((b.x0 + b.x1) / 2 * b.paneles_ancho for b in candidatos) / peso
    cy = sum((b.y0 + b.y1) / 2 * b.paneles_ancho for b in candidatos) / peso

    def prioridad(b: _BloqueLocal) -> tuple[bool, float, float, float]:
        distancia = math.hypot((b.x0 + b.x1) / 2 - cx, (b.y0 + b.y1) / 2 - cy)
        # Redondeo al centímetro: dos bloques a la misma distancia se ordenan por posición
        return (b.paneles_ancho < completo, round(distancia, 2), b.x0, b.y0)

    resultado = []
    faltan = paneles_necesarios
    for b in sorted(candidatos, key=prioridad):
        if faltan <= 0:
            break
        paneles = paneles_largo * b.paneles_ancho
        if paneles <= faltan:
            resultado.append(b)
            faltan -= paneles
        else:
            a = max(math.ceil(faltan / paneles_largo), piso)
            resultado.append(
                _BloqueLocal(b.x0, b.y0, b.x1, b.y0 + medida_fila(a, lado_menor_m, separacion_paneles_m), a)
            )
            faltan = 0
    return resultado


def electrica_inversor(
    paneles: int,
    panel_voc: float | None,
    panel_vmp: float | None,
    inversor: InversorLayout,
) -> ElectricaInversor:
    """
    Strings y distribución por MPPT de un inversor, con los paneles de
    los bloques que tiene asignados.

    Se usa el string más largo permitido: menos strings, menos cableado
    y menos entradas de MPPT ocupadas. Los paneles que no completan un
    string se informan para que el instalador decida (acortar strings o
    quitar paneles).
    """
    vacio = dict(
        paneles_por_string_min=None,
        paneles_por_string_max=None,
        paneles_por_string=None,
        strings=None,
        paneles_sin_string=None,
        strings_por_mppt=None,
    )
    if paneles <= 0:
        return ElectricaInversor(**vacio, compatible=None, motivo="No tiene bloques asignados.")
    if not (inversor.vmax_v and inversor.vmin_v and panel_voc and panel_vmp):
        return ElectricaInversor(
            **vacio,
            compatible=None,
            motivo="Faltan Vmax y Vmin del inversor para calcular los strings.",
        )

    limites = limites_string(inversor.vmax_v, inversor.vmin_v, panel_voc, panel_vmp)
    if not limites.compatible:
        return ElectricaInversor(
            **{**vacio, "paneles_por_string_min": limites.paneles_min, "paneles_por_string_max": limites.paneles_max},
            compatible=False,
            motivo=limites.motivo,
        )

    por_string = limites.paneles_max
    strings = paneles // por_string
    sobrantes = paneles % por_string

    por_mppt = None
    compatible = True
    motivo = None
    if inversor.mppts:
        por_mppt = math.ceil(strings / inversor.mppts) if strings else 0
        if inversor.strings_por_mppt and por_mppt > inversor.strings_por_mppt:
            compatible = False
            admite = inversor.mppts * inversor.strings_por_mppt * por_string
            motivo = (
                f"Cada MPPT recibiría {por_mppt} strings y admite {inversor.strings_por_mppt}: "
                f"este inversor admite hasta {admite} paneles y tiene {paneles}. Agrega otro "
                f"inversor o pasa bloques a uno con menos carga."
            )

    return ElectricaInversor(
        paneles_por_string_min=limites.paneles_min,
        paneles_por_string_max=limites.paneles_max,
        paneles_por_string=por_string,
        strings=strings,
        paneles_sin_string=sobrantes,
        strings_por_mppt=por_mppt,
        compatible=compatible,
        motivo=motivo,
    )


# ─── Asignación de bloques a inversores ─────────────────────────────


def asignar_inversores(
    bloques: Sequence[tuple[list[list[float]], int]],
    potencias_kw: Sequence[float],
    angulo_norte: float = 0.0,
) -> list[int]:
    """
    A qué inversor va cada bloque: el número del inversor (0 = el primero).

    `bloques` son pares (vértices, paneles). Los bloques se recorren de
    oeste a este por franja y, dentro de cada franja, de sur a norte (el
    mismo orden en que el algoritmo los ubica), y se cortan en tramos
    seguidos. Así cada inversor recibe un sector compacto de la planta,
    que es lo que acorta el cableado.

    Cada inversor recibe paneles en proporción a su potencia: con dos
    iguales, mitad y mitad. Un bloque no se parte, así que el reparto
    exacto se aproxima: el bloque va al inversor en cuyo tramo cae su
    punto medio.

    Si hay más inversores que bloques, alguno queda sin bloques; la
    pantalla lo avisa.
    """
    n = len(bloques)
    if n == 0:
        return []
    if len(potencias_kw) <= 1:
        return [0] * n

    theta = math.radians(angulo_norte)
    cos_t, sin_t = math.cos(theta), math.sin(theta)

    def posicion_local(i: int) -> tuple[float, float]:
        # Esquina suroeste llevada al marco con el norte hacia +Y
        x, y = bloques[i][0][3]
        return (round(x * cos_t - y * sin_t, 1), y * cos_t + x * sin_t)

    orden = sorted(range(n), key=posicion_local)

    total = sum(paneles for _, paneles in bloques)
    suma = sum(potencias_kw)
    cortes = list(accumulate(total * p / suma for p in potencias_kw[:-1]))

    asignacion = [0] * n
    acumulado = 0
    for i in orden:
        paneles = bloques[i][1]
        asignacion[i] = bisect_left(cortes, acumulado + paneles / 2)
        acumulado += paneles
    return asignacion


# ─── Agrupación por tipo ────────────────────────────────────────────


def _letra(indice: int) -> str:
    """0 → A, 25 → Z, 26 → AA. Más de 26 tipos es raro, pero no imposible."""
    letras = ""
    indice += 1
    while indice:
        indice, resto = divmod(indice - 1, 26)
        letras = chr(65 + resto) + letras
    return letras


def advertencia_proporcion(tipos: list[TipoBloque], tolerancia: float) -> str | None:
    """Aviso de bloques no compactos, o None si todos lo son."""
    fuera = sum(t.repeticiones for t in tipos if not t.en_proporcion)
    if not fuera:
        return None
    return (
        f"{fuera} bloque(s) no son compactos: se apartan más de {tolerancia:.0%} de "
        f"A = 3 × L. Es una recomendación antisísmica, no un error; revísalos antes de confirmar."
    )


def agrupar_por_tipo(bloques: list[Bloque]) -> tuple[list[Bloque], list[TipoBloque]]:
    """
    Agrupa los bloques idénticos y les asigna una letra.

    El tipo más repetido es "A": así el bloque principal de la planta
    siempre se llama igual que en los bocetos de HEXtructure.
    """
    conteo: dict[tuple[int, int], list[Bloque]] = {}
    for b in bloques:
        conteo.setdefault((b.paneles_largo, b.paneles_ancho), []).append(b)

    orden = sorted(conteo.items(), key=lambda item: (-len(item[1]), -item[0][1]))
    tipos = []
    letra_de: dict[tuple[int, int], str] = {}
    for i, ((l, a), grupo) in enumerate(orden):
        letra = _letra(i)
        letra_de[(l, a)] = letra
        tipos.append(
            TipoBloque(
                tipo=letra,
                paneles_largo=l,
                paneles_ancho=a,
                repeticiones=len(grupo),
                proporcion=grupo[0].proporcion,
                en_proporcion=grupo[0].en_proporcion,
            )
        )

    con_tipo = [
        Bloque(
            vertices=b.vertices,
            paneles_largo=b.paneles_largo,
            paneles_ancho=b.paneles_ancho,
            proporcion=b.proporcion,
            en_proporcion=b.en_proporcion,
            tipo=letra_de[(b.paneles_largo, b.paneles_ancho)],
        )
        for b in bloques
    ]
    return con_tipo, tipos


# ─── Punto de entrada ───────────────────────────────────────────────


ORIENTACIONES = ("norte", "terreno")
# Lados más cortos que esta fracción del mayor no proponen una dirección:
# un quiebre de pocos metros no ordena los bloques.
LADO_MINIMO_FRACCION = 0.1
# Direcciones distintas que se prueban, de los lados más largos a los más
# cortos. Cada una son dos generaciones completas (filas a lo largo y de
# través del lado).
MAX_DIRECCIONES = 6


def _girar_180(angulo: float) -> float:
    """El mismo giro en [−90, 90): un bloque girado 180° es el mismo bloque."""
    return (angulo + 90) % 180 - 90


def angulos_del_terreno(terreno: Sequence[Sequence[float]]) -> list[float]:
    """
    Giros que alinean los bloques con el terreno, en grados en sentido
    horario desde +Y (la misma convención que `orientacion_norte`).

    Por cada dirección de lado (sin repetir las paralelas), las dos
    posiciones del bloque: las filas (A) a lo largo del lado o de través.
    En Envasur las filas van de través a la franja; en otros terrenos, a lo
    largo: por eso se prueban las dos.
    """
    lados = []
    n = len(terreno)
    for i in range(n):
        (x0, y0), (x1, y1) = terreno[i][:2], terreno[(i + 1) % n][:2]
        largo = math.hypot(x1 - x0, y1 - y0)
        if largo > _EPS:
            lados.append((largo, math.degrees(math.atan2(x1 - x0, y1 - y0))))
    if not lados:
        return []
    mayor = max(largo for largo, _ in lados)
    angulos: list[float] = []
    direcciones = 0
    for largo, direccion in sorted(lados, reverse=True):
        if largo < LADO_MINIMO_FRACCION * mayor or direcciones >= MAX_DIRECCIONES:
            break
        nuevos = [_girar_180(direccion), _girar_180(direccion + 90)]
        if any(min(abs(a - b), 180 - abs(a - b)) < 0.5 for a in nuevos for b in angulos):
            continue
        angulos.extend(nuevos)
        direcciones += 1
    return [round(a, 6) for a in angulos]


def _mejor_desfase(
    util_local: BaseGeometry,
    *,
    largo_planta: float,
    separacion_eo: float,
    ancho_bloque: float,
    lado_menor: float,
    separacion_ns: float,
    a_ideal: int,
    paneles_ancho_minimo: int,
    separacion_paneles_m: float,
    paneles_largo: int,
) -> tuple[list[_BloqueLocal], tuple[int, int]]:
    """El desfase de la primera franja que ubica más paneles, en el marco ya girado."""
    paso_x = largo_planta + separacion_eo
    mejor: list[_BloqueLocal] = []
    mejor_clave = (0, 0)
    for k in range(DESFASES):
        candidatos = _distribuir(
            util_local,
            desfase=paso_x * k / DESFASES,
            ancho_franja=largo_planta,
            paso_x=paso_x,
            alto_bloque=ancho_bloque,
            lado_menor_m=lado_menor,
            separacion_y=separacion_ns,
            paneles_ancho=a_ideal,
            paneles_ancho_minimo=paneles_ancho_minimo,
            separacion_paneles_m=separacion_paneles_m,
        )
        paneles = sum(paneles_largo * b.paneles_ancho for b in candidatos)
        cortos = sum(1 for b in candidatos if b.paneles_ancho != a_ideal)
        # Más paneles primero; a igualdad, menos bloques fuera de medida.
        clave = (paneles, -cortos)
        if paneles and (not mejor or clave > mejor_clave):
            mejor, mejor_clave = candidatos, clave
    return mejor, mejor_clave


def generar_layout(
    terreno: list[list[float]],
    caminos: list[list[list[float]]],
    panel: PanelLayout,
    parametros: ParametrosLayout,
    *,
    orientacion_norte: float | None = None,
    latitud: float | None = None,
    orientacion_bloques: str = "norte",
) -> ResultadoLayout:
    """
    `orientacion_bloques`: "norte" (filas de norte a sur) o "terreno"
    (alineados con el lado del terreno que más paneles ubica).
    """
    if orientacion_bloques not in ORIENTACIONES:
        raise LayoutImposible("La orientación de los bloques debe ser norte o terreno.")
    if parametros.paneles_largo < 2 or parametros.paneles_largo % 2:
        raise LayoutImposible("L debe ser un número par mayor o igual a 2.")
    if parametros.paneles_ancho_minimo < 1:
        raise LayoutImposible("El A mínimo debe ser al menos 1.")
    if parametros.paneles_ancho is not None and parametros.paneles_ancho < 1:
        raise LayoutImposible("A debe ser al menos 1.")
    if parametros.separacion_largo_m < 0 or parametros.separacion_ancho_m < 0:
        raise LayoutImposible("La separación entre paneles no puede ser negativa.")

    advertencias: list[str] = []

    lado_mayor = max(panel.largo_mm, panel.ancho_mm) / 1000
    lado_menor = min(panel.largo_mm, panel.ancho_mm) / 1000
    L = parametros.paneles_largo
    beta = math.radians(panel.angulo_montaje)

    # ─── Dimensiones del bloque ──────────────────────────────────
    sep_largo = parametros.separacion_largo_m
    sep_ancho = parametros.separacion_ancho_m
    a_ideal = parametros.paneles_ancho or paneles_ancho_ideal(L)
    if parametros.paneles_ancho_minimo > a_ideal:
        raise LayoutImposible(
            f"El A mínimo ({parametros.paneles_ancho_minimo}) supera el A del bloque "
            f"({a_ideal}): no se generaría ningún bloque. Usa un A mínimo de {a_ideal} o menos."
        )
    largo_nominal = medida_fila(L, lado_mayor, sep_largo)
    ancho_bloque = medida_fila(a_ideal, lado_menor, sep_ancho)
    # En planta, la pendiente acorta el largo: es lo que ocupa en el suelo.
    largo_planta = largo_nominal * math.cos(beta)

    # ─── Separaciones ────────────────────────────────────────────
    separacion_ns = parametros.pasillo_m
    separacion_eo = parametros.pasillo_m
    if latitud is None:
        advertencias.append(
            "El proyecto no tiene latitud: la separación este-oeste usa solo el "
            "pasillo, sin verificar la sombra entre bloques."
        )
    else:
        sombra = separacion_entre_filas(largo_nominal, panel.angulo_montaje, latitud).sombra_m
        if sombra > separacion_eo:
            separacion_eo = sombra
            advertencias.append(
                f"La sombra entre bloques ({sombra:.2f} m) supera el pasillo: se usa "
                f"como separación este-oeste."
            )

    # ─── Área útil, rotada con el norte hacia +Y ─────────────────
    poligono_terreno = Polygon(terreno)
    util = poligono_terreno
    if caminos:
        util = poligono_terreno.difference(unary_union([Polygon(c) for c in caminos]))
    util = util.buffer(0)
    area_util = util.area

    if orientacion_norte is None:
        advertencias.append(
            "El terreno no tiene orientación del norte: se tomó la parte superior "
            "del plano como norte. Defínela en la pestaña Terreno para un layout fiel."
        )
    angulo_norte = orientacion_norte or 0.0
    medidas = {
        "largo_planta": largo_planta,
        "separacion_eo": separacion_eo,
        "ancho_bloque": ancho_bloque,
        "lado_menor": lado_menor,
        "separacion_ns": separacion_ns,
        "a_ideal": a_ideal,
        "paneles_ancho_minimo": parametros.paneles_ancho_minimo,
        "separacion_paneles_m": sep_ancho,
        "paneles_largo": L,
    }

    def probar(giro: float) -> tuple[list[_BloqueLocal], tuple[int, int]]:
        # Norte (o el giro) a θ° en sentido horario desde +Y; girar θ°
        # antihorario lo lleva a +Y. Al final se deshace con −θ.
        return _mejor_desfase(rotate(util, giro, origin=(0, 0)), **medidas)

    # ─── Las dos orientaciones: norte y alineada al terreno ──────
    bloques_norte, clave_norte = probar(angulo_norte)
    terreno_elegido: tuple[tuple[int, int, float], float, list[_BloqueLocal]] | None = None
    for giro in angulos_del_terreno(terreno):
        bloques_giro, clave_giro = probar(giro)
        if not bloques_giro:
            continue
        # Más paneles, menos bloques fuera de medida y, a igualdad, el giro
        # más cercano al norte.
        clave = (clave_giro[0], clave_giro[1], -abs(_girar_180(giro - angulo_norte)))
        if terreno_elegido is None or clave > terreno_elegido[0]:
            terreno_elegido = (clave, giro, bloques_giro)
    paneles_norte = clave_norte[0]
    paneles_terreno = terreno_elegido[0][0] if terreno_elegido else 0

    orientacion_usada = "terreno" if orientacion_bloques == "terreno" and terreno_elegido is not None else "norte"
    if orientacion_usada == "terreno":
        angulo, mejor = terreno_elegido[1], terreno_elegido[2]
        giro = _girar_180(angulo - angulo_norte)
        advertencias.append(
            f"Bloques alineados con el terreno, girados {abs(giro):.1f}° respecto del norte: "
            f"entran {paneles_terreno} paneles; siguiendo el norte entrarían {paneles_norte}."
        )
    else:
        angulo, mejor = angulo_norte, bloques_norte
        if paneles_terreno > paneles_norte:
            advertencias.append(
                f"Alineando los bloques con el terreno entrarían {paneles_terreno} paneles, "
                f"{paneles_terreno - paneles_norte} más que siguiendo el norte. Cámbialo en "
                f"«Orientación de los bloques»."
            )

    if not mejor:
        sugerencia = (
            f" Alineando los bloques con el terreno sí entran {paneles_terreno} paneles."
            if orientacion_bloques == "norte" and paneles_terreno
            else ""
        )
        raise LayoutImposible(
            f"No entra ningún bloque de {L} paneles de largo ({largo_planta:.2f} m en "
            f"planta) en el área útil. Prueba con un L menor, un pasillo más angosto "
            f"o revisa que los caminos no cubran todo el terreno.{sugerencia}"
        )

    # ─── Capacidad deseada ───────────────────────────────────────
    total_maximo = sum(L * b.paneles_ancho for b in mejor)
    maxima_kwp = total_maximo * panel.potencia_wp / 1000
    capacidad = None
    if parametros.capacidad_deseada_kwp:
        necesarios = math.ceil(parametros.capacidad_deseada_kwp * 1000 / panel.potencia_wp - _EPS)
        cabe = necesarios <= total_maximo
        if cabe:
            mejor = _recortar_a_capacidad(
                mejor, necesarios, L, lado_menor, parametros.paneles_ancho_minimo, sep_ancho
            )
        else:
            advertencias.append(
                f"La capacidad deseada ({parametros.capacidad_deseada_kwp:g} kWp) no cabe. "
                f"La máxima alcanzable con esta configuración es {maxima_kwp:.1f} kWp."
            )
        instalada = sum(L * b.paneles_ancho for b in mejor) * panel.potencia_wp / 1000
        capacidad = Capacidad(
            deseada_kwp=parametros.capacidad_deseada_kwp,
            paneles_necesarios=necesarios,
            cabe=cabe,
            maxima_kwp=round(maxima_kwp, 2),
            instalada_kwp=round(instalada, 2),
            remanente_kwp=round(maxima_kwp - instalada, 2),
        )

    # ─── Volver a coordenadas del terreno ────────────────────────
    bloques = []
    for b in mejor:
        esquinas = vertices_de(rotate(box(b.x0, b.y0, b.x1, b.y1), -angulo, origin=(0, 0)))
        prop = proporcion_bloque(L, b.paneles_ancho)
        bloques.append(
            Bloque(
                vertices=esquinas,
                paneles_largo=L,
                paneles_ancho=b.paneles_ancho,
                proporcion=round(prop, 3),
                en_proporcion=cumple_proporcion(prop, parametros.tolerancia_proporcion),
            )
        )

    bloques, tipos = agrupar_por_tipo(bloques)
    total = sum(b.paneles for b in bloques)

    aviso = advertencia_proporcion(tipos, parametros.tolerancia_proporcion)
    if aviso:
        advertencias.append(aviso)

    compacto = cumple_proporcion(proporcion_bloque(L, a_ideal), parametros.tolerancia_proporcion)
    if not compacto:
        advertencias.append(
            f"El bloque de {L} × {a_ideal} no es compacto: para un bloque antisísmico se "
            f"recomienda A = 3 × L = {paneles_ancho_ideal(L)}. Puedes seguir si el cliente "
            f"lo pide así."
        )

    return ResultadoLayout(
        bloques=bloques,
        tipos=tipos,
        total_paneles=total,
        potencia_kwp=round(total * panel.potencia_wp / 1000, 2),
        paneles_ancho_ideal=a_ideal,
        largo_bloque_m=round(largo_planta, 3),
        ancho_bloque_m=round(ancho_bloque, 3),
        separacion_este_oeste_m=round(separacion_eo, 3),
        separacion_norte_sur_m=round(separacion_ns, 3),
        area_util_m2=round(area_util, 2),
        area_ocupada_m2=round(sum(Polygon(b.vertices).area for b in bloques), 2),
        capacidad=capacidad,
        advertencias=advertencias,
        angulo_norte=angulo,
        lado_menor_m=lado_menor,
        separacion_largo_m=sep_largo,
        separacion_ancho_m=sep_ancho,
        bloque_compacto=compacto,
        orientacion_bloques=orientacion_usada,
        paneles_norte=paneles_norte,
        paneles_terreno=paneles_terreno,
    )


# ─── Edición manual (SQ-64) ─────────────────────────────────────────

# Penetración que se tolera: 5 mm. Un bloque puede asomarse hasta eso
# fuera del terreno, sobre un camino o sobre otro bloque sin que cuente
# como error. Absorbe el redondeo de las coordenadas al milímetro.
#
# Es una medida de profundidad y no de área a propósito: dos bloques que
# se rozan 0,5 mm a lo largo de 27 m suman 0,0135 m², y una tolerancia
# por área los rechazaría por puro redondeo.
#
# La misma regla está en frontend/src/utils/edicionLayout.ts, para que
# la pantalla marque exactamente lo que el backend va a rechazar.
TOLERANCIA_PENETRACION_M = 0.005


class EdicionInvalida(ValueError):
    """La edición deja un bloque en una posición imposible de construir."""


def validar_bloques(
    terreno: list[list[float]],
    caminos: list[list[list[float]]],
    bloques: list[Polygon],
    pasillo_m: float,
    angulo_norte: float = 0.0,
) -> list[str]:
    """
    Comprueba que los bloques editados se puedan construir.

    Bloquea (lanza `EdicionInvalida`) lo que no tiene arreglo en obra:
    un bloque fuera del terreno, sobre un camino o encima de otro. Lo
    que es mala práctica pero posible —un pasillo más angosto que el
    configurado— solo se devuelve como advertencia.

    Todo se evalúa en el marco local (norte hacia +Y), donde los bloques
    son rectángulos alineados a los ejes. Cada bloque se achica la
    tolerancia por lado: si aun así toca el borde, un camino u otro
    bloque, se mete más de 5 mm.

    Los bloques se numeran desde 1 en el orden recibido, que es el orden
    en que la pantalla los lista.
    """
    t = TOLERANCIA_PENETRACION_M
    a_local = lambda g: rotate(g, angulo_norte, origin=(0, 0))  # noqa: E731

    cajas = [a_local(b).bounds for b in bloques]  # (x0, y0, x1, y1)
    reducidos = [box(x0 + t, y0 + t, x1 - t, y1 - t) for x0, y0, x1, y1 in cajas]

    terreno_local = a_local(Polygon(terreno))
    for i, r in enumerate(reducidos, start=1):
        if not terreno_local.contains(r):
            raise EdicionInvalida(f"El bloque {i} se sale del terreno.")

    if caminos:
        caminos_local = unary_union([a_local(Polygon(c)) for c in caminos])
        for i, r in enumerate(reducidos, start=1):
            if r.intersects(caminos_local):
                raise EdicionInvalida(f"El bloque {i} queda sobre un camino.")

    # Índice espacial: con miles de bloques, comparar todos contra todos
    # serían millones de comparaciones. El bloque achicado contra el otro
    # entero: se tocan solo si se meten más de t uno en otro.
    bloques_locales = [box(*c) for c in cajas]
    arbol = STRtree(bloques_locales)
    pares = arbol.query(reducidos, predicate="intersects")
    conflictos = sorted({(min(i, j), max(i, j)) for i, j in zip(*pares) if i != j})
    if conflictos:
        i, j = conflictos[0]
        raise EdicionInvalida(f"Los bloques {i + 1} y {j + 1} se superponen.")

    advertencias = []
    if pasillo_m > 0:
        # 1 cm de margen para no avisar por diferencias de redondeo
        cercanos = arbol.query(bloques_locales, predicate="dwithin", distance=pasillo_m - 0.01)
        pares = sum(1 for i, j in zip(*cercanos) if i < j)
        if pares:
            advertencias.append(
                f"{pares} par(es) de bloques quedan a menos de {pasillo_m:g} m, el pasillo "
                f"configurado. Se puede construir, pero dificulta el mantenimiento."
            )
    return advertencias
