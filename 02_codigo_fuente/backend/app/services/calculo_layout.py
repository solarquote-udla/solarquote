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

El panel va con su lado mayor en la dirección de L. En metros:

    largo_m = L · lado_mayor        ancho_m = A · lado_menor

Regla antisísmica del documento de titulación: ancho = 3 · largo. Con L
fijado por el usuario, A se elige como el entero que más se acerca a esa
proporción. Los bloques que se aparten más de la tolerancia (±20 % por
defecto) se marcan en ámbar; no se descartan, porque la decisión final es
del Gerente General (RF-05).

Orientación
-----------
Las filas (dirección de A) corren de norte a sur y la pendiente (L) va de
este a oeste, como en el plano de San Pablo del Lago. `orientacion_norte`
del terreno indica hacia dónde apunta el norte, en grados medidos en
sentido horario desde el eje +Y del canvas. Si no está definida, se toma
el eje +Y como norte y se advierte.

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
   de proporción y por eso sale en ámbar.
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
from dataclasses import dataclass, field

from shapely.affinity import rotate
from shapely import STRtree
from shapely.geometry import Point, Polygon, box
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union

from app.services.calculo_equipo import (
    inversores_sugeridos,
    limites_string,
    separacion_entre_filas,
)

# Proporción estructural ancho / largo validada por simulación antisísmica.
RELACION_OBJETIVO = 3.0

TOLERANCIA_DEFECTO = 0.20
PASILLO_DEFECTO_M = 2.0
PANELES_LARGO_DEFECTO = 4

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
class Electrica:
    paneles_por_string_min: int | None
    paneles_por_string_max: int | None
    paneles_por_string: int | None
    strings_totales: int | None
    paneles_sin_string: int | None
    inversores: int
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
    electrica: Electrica
    advertencias: list[str] = field(default_factory=list)
    # Necesarios para editar bloques después (SQ-64): con la orientación
    # y el ancho de un panel, un bloque se reconstruye a partir de su
    # esquina suroeste y su A.
    angulo_norte: float = 0.0
    lado_menor_m: float = 0.0


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


def paneles_ancho_ideal(paneles_largo: int, lado_mayor_m: float, lado_menor_m: float) -> int:
    """
    A que deja el bloque más cerca de ancho = 3 · largo.

    Con el panel de 2278 × 1134 mm y L = 4: largo = 9,112 m, el ancho
    ideal es 27,34 m y A = round(27,34 / 1,134) = 24.
    """
    ideal = RELACION_OBJETIVO * paneles_largo * lado_mayor_m / lado_menor_m
    return max(1, round(ideal))


def proporcion_bloque(
    paneles_largo: int,
    paneles_ancho: int,
    lado_mayor_m: float,
    lado_menor_m: float,
) -> float:
    """ancho_m / largo_m, sobre las dimensiones nominales de la estructura."""
    return (paneles_ancho * lado_menor_m) / (paneles_largo * lado_mayor_m)


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
) -> list[tuple[float, float, int]]:
    """
    Bloques que entran en un tramo vertical: (y_inicio, y_fin, A).

    Completos primero; con lo que sobra, uno más corto si entra al
    menos un panel.
    """
    resultado = []
    y = inicio
    while y + alto_bloque <= fin + _EPS:
        resultado.append((y, y + alto_bloque, paneles_ancho))
        y += alto_bloque + separacion

    sobrante = fin - y
    a_corto = math.floor(sobrante / lado_menor_m + _EPS)
    if a_corto >= 1:
        resultado.append((y, y + a_corto * lado_menor_m, a_corto))
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
) -> list[_BloqueLocal]:
    minx, miny, maxx, maxy = util.bounds
    bloques: list[_BloqueLocal] = []

    x = minx + desfase
    while x + ancho_franja <= maxx + _EPS:
        for inicio, fin in _tramos_libres(util, x, x + ancho_franja, miny, maxy):
            for y0, y1, a in _llenar_tramo(
                inicio, fin, alto_bloque, lado_menor_m, separacion_y, paneles_ancho
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
) -> list[_BloqueLocal]:
    """
    Se queda con los bloques justos para la capacidad pedida.

    Recorre en orden de franja y altura, que mantiene la planta compacta.
    El último bloque se acorta para no pasarse más de una fila de L.
    """
    resultado = []
    faltan = paneles_necesarios
    for b in sorted(bloques, key=lambda b: (b.x0, b.y0)):
        if faltan <= 0:
            break
        paneles = paneles_largo * b.paneles_ancho
        if paneles <= faltan:
            resultado.append(b)
            faltan -= paneles
        else:
            a = math.ceil(faltan / paneles_largo)
            resultado.append(_BloqueLocal(b.x0, b.y0, b.x1, b.y0 + a * lado_menor_m, a))
            faltan = 0
    return resultado


def configuracion_electrica(total_paneles: int, panel_voc: float | None,
                            panel_vmp: float | None,
                            inversor: InversorLayout) -> Electrica:
    """
    Strings y distribución por MPPT para el total de paneles del layout.

    Se usa el string más largo permitido: menos strings, menos cableado
    y menos entradas de MPPT ocupadas. Los paneles que no completan un
    string se informan para que el instalador decida (acortar strings o
    quitar paneles).
    """
    inversores = inversores_sugeridos(total_paneles)
    sin_datos = Electrica(
        paneles_por_string_min=None,
        paneles_por_string_max=None,
        paneles_por_string=None,
        strings_totales=None,
        paneles_sin_string=None,
        inversores=inversores,
        strings_por_mppt=None,
        compatible=None,
        motivo="Faltan Vmax y Vmin del inversor para calcular los strings.",
    )
    if not (inversor.vmax_v and inversor.vmin_v and panel_voc and panel_vmp):
        return sin_datos

    limites = limites_string(inversor.vmax_v, inversor.vmin_v, panel_voc, panel_vmp)
    if not limites.compatible:
        return Electrica(
            paneles_por_string_min=limites.paneles_min,
            paneles_por_string_max=limites.paneles_max,
            paneles_por_string=None,
            strings_totales=None,
            paneles_sin_string=None,
            inversores=inversores,
            strings_por_mppt=None,
            compatible=False,
            motivo=limites.motivo,
        )

    por_string = limites.paneles_max
    strings = total_paneles // por_string
    sobrantes = total_paneles % por_string

    por_mppt = None
    compatible = True
    motivo = None
    if inversor.mppts and inversores:
        por_mppt = math.ceil(strings / (inversores * inversor.mppts)) if strings else 0
        if inversor.strings_por_mppt and por_mppt > inversor.strings_por_mppt:
            compatible = False
            necesarios = math.ceil(strings / (inversor.mppts * inversor.strings_por_mppt))
            motivo = (
                f"Con {inversores} inversor(es) cada MPPT recibiría {por_mppt} strings y "
                f"admite {inversor.strings_por_mppt}. Se necesitan al menos {necesarios} "
                f"inversores de este modelo."
            )

    return Electrica(
        paneles_por_string_min=limites.paneles_min,
        paneles_por_string_max=limites.paneles_max,
        paneles_por_string=por_string,
        strings_totales=strings,
        paneles_sin_string=sobrantes,
        inversores=inversores,
        strings_por_mppt=por_mppt,
        compatible=compatible,
        motivo=motivo,
    )


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
    """Aviso de bloques fuera de proporción, o None si todos cumplen."""
    fuera = sum(t.repeticiones for t in tipos if not t.en_proporcion)
    if not fuera:
        return None
    return (
        f"{fuera} bloque(s) se apartan más de {tolerancia:.0%} de la proporción "
        f"ancho = 3 × largo. Revísalos antes de confirmar."
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


def generar_layout(
    terreno: list[list[float]],
    caminos: list[list[list[float]]],
    panel: PanelLayout,
    parametros: ParametrosLayout,
    *,
    orientacion_norte: float | None = None,
    latitud: float | None = None,
    inversor: InversorLayout | None = None,
    panel_voc: float | None = None,
    panel_vmp: float | None = None,
) -> ResultadoLayout:
    if parametros.paneles_largo < 2 or parametros.paneles_largo % 2:
        raise LayoutImposible("L debe ser un número par mayor o igual a 2.")

    advertencias: list[str] = []
    inversor = inversor or InversorLayout()

    lado_mayor = max(panel.largo_mm, panel.ancho_mm) / 1000
    lado_menor = min(panel.largo_mm, panel.ancho_mm) / 1000
    L = parametros.paneles_largo
    beta = math.radians(panel.angulo_montaje)

    # ─── Dimensiones del bloque ideal ────────────────────────────
    a_ideal = paneles_ancho_ideal(L, lado_mayor, lado_menor)
    largo_nominal = L * lado_mayor
    ancho_bloque = a_ideal * lado_menor
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
    angulo = orientacion_norte or 0.0
    # Norte a θ° en sentido horario desde +Y; girar θ° antihorario lo
    # lleva a +Y. Al final se deshace con −θ.
    util_local = rotate(util, angulo, origin=(0, 0))

    # ─── Búsqueda del mejor desfase ──────────────────────────────
    paso_x = largo_planta + separacion_eo
    mejor: list[_BloqueLocal] = []
    mejor_clave = (-1, 0)
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
        )
        paneles = sum(L * b.paneles_ancho for b in candidatos)
        cortos = sum(1 for b in candidatos if b.paneles_ancho != a_ideal)
        # Más paneles primero; a igualdad, menos bloques fuera de medida.
        clave = (paneles, -cortos)
        if clave > mejor_clave:
            mejor, mejor_clave = candidatos, clave

    if not mejor:
        raise LayoutImposible(
            f"No entra ningún bloque de {L} paneles de largo ({largo_planta:.2f} m en "
            f"planta) en el área útil. Prueba con un L menor, un pasillo más angosto "
            f"o revisa que los caminos no cubran todo el terreno."
        )

    # ─── Capacidad deseada ───────────────────────────────────────
    total_maximo = sum(L * b.paneles_ancho for b in mejor)
    maxima_kwp = total_maximo * panel.potencia_wp / 1000
    capacidad = None
    if parametros.capacidad_deseada_kwp:
        necesarios = math.ceil(parametros.capacidad_deseada_kwp * 1000 / panel.potencia_wp - _EPS)
        cabe = necesarios <= total_maximo
        if cabe:
            mejor = _recortar_a_capacidad(mejor, necesarios, L, lado_menor)
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
        prop = proporcion_bloque(L, b.paneles_ancho, lado_mayor, lado_menor)
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

    if not cumple_proporcion(
        proporcion_bloque(L, a_ideal, lado_mayor, lado_menor), parametros.tolerancia_proporcion
    ):
        advertencias.append(
            "Con este panel ni siquiera el bloque ideal cumple la proporción: "
            "prueba con otro L."
        )

    electrica = configuracion_electrica(total, panel_voc, panel_vmp, inversor)

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
        electrica=electrica,
        advertencias=advertencias,
        angulo_norte=angulo,
        lado_menor_m=lado_menor,
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
