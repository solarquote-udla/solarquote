"""
Operaciones geométricas sobre los polígonos del Módulo 1.

Por qué Shapely
---------------
El área útil es el terreno menos los caminos. Restar el área de cada
camino por separado da un resultado incorrecto en cuanto dos caminos se
cruzan: la intersección se descuenta dos veces. El caso es común — un
camino de acceso que desemboca en uno interno — así que no es una
esquina rara que se pueda ignorar.

La operación correcta es la diferencia entre el polígono del terreno y
la *unión* de los caminos. Implementar recorte de polígonos a mano es
bastante código y bastante propenso a errores de precisión; Shapely lo
resuelve y además provee las pruebas de contención e intersección que
RF-03 va a necesitar para ubicar los bloques de paneles.

Se prefirió sobre PostGIS porque no requiere extensión en la base ni
complica Alembic, y el volumen de datos — tres o cuatro polígonos por
proyecto — no justifica cálculo del lado del servidor de base.
"""

from shapely.geometry import MultiPoint, Polygon
from shapely.ops import unary_union

# Tolerancia para comparaciones de área, en metros cuadrados. Por debajo
# de esto el valor es ruido de punto flotante, no superficie real.
TOLERANCIA_AREA = 0.01

# Mínimo de vértices para que una figura cerrada encierre superficie.
MIN_VERTICES = 3


class GeometriaInvalida(ValueError):
    """
    El polígono recibido no describe una figura utilizable.

    Se lanza en la capa de validación para que FastAPI la traduzca a un
    422 con un mensaje que el usuario pueda accionar, en vez de dejar
    que reviente más abajo con un error opaco.
    """


def _a_poligono(vertices: list[list[float]], etiqueta: str) -> Polygon:
    """
    Convierte una lista de vértices en un polígono validado.

    `etiqueta` se usa solo para construir mensajes de error legibles:
    "El terreno..." o "El camino 'Acceso norte'...".
    """
    if len(vertices) < MIN_VERTICES:
        raise GeometriaInvalida(
            f"{etiqueta} necesita al menos {MIN_VERTICES} vértices para "
            f"encerrar una superficie; se recibieron {len(vertices)}."
        )

    for i, vertice in enumerate(vertices):
        if len(vertice) != 2:
            raise GeometriaInvalida(
                f"{etiqueta}: el vértice en la posición {i} debe tener "
                f"exactamente dos coordenadas [x, y]."
            )

    # Vértices alineados sobre una recta. Se detecta con el casco
    # convexo: si ni siquiera la envolvente de los puntos tiene área,
    # ninguna forma de unirlos encierra superficie.
    #
    # La verificación va antes que `is_valid` porque Shapely reporta el
    # caso colineal como "Self-intersection", igual que un polígono en
    # forma de moño. Son errores distintos y el usuario necesita saber
    # cuál cometió: uno se arregla moviendo un vértice, el otro
    # reordenándolos.
    if MultiPoint(vertices).convex_hull.area < TOLERANCIA_AREA:
        raise GeometriaInvalida(
            f"{etiqueta} tiene área nula: los vértices están alineados "
            f"sobre una misma recta. Mueve al menos uno fuera de ella."
        )

    poligono = Polygon(vertices)

    # Auto-intersección: el contorno se cruza consigo mismo. El área de
    # una figura así no está definida de forma útil.
    if not poligono.is_valid:
        raise GeometriaInvalida(
            f"{etiqueta} se cruza consigo mismo. Revisa el orden de los "
            f"vértices: deben recorrer el contorno sin saltos."
        )

    return poligono


def validar_poligono(vertices: list[list[float]], etiqueta: str) -> None:
    """
    Comprueba que los vértices describan un polígono utilizable.

    Lanza `GeometriaInvalida` con un mensaje accionable si no lo es. La
    usa la capa de schemas para rechazar la entrada antes de llegar a la
    base de datos.
    """
    _a_poligono(vertices, etiqueta)


def area_poligono(vertices: list[list[float]], etiqueta: str = "El polígono") -> float:
    """Área en metros cuadrados de un polígono definido por sus vértices."""
    return _a_poligono(vertices, etiqueta).area


def calcular_areas(
    terreno: list[list[float]],
    caminos: list[list[list[float]]],
) -> dict[str, float]:
    """
    Descompone la superficie del terreno en bruta, ocupada y útil.

    Los caminos se unen antes de restarse, de modo que las zonas donde
    se solapan cuentan una sola vez. La unión se recorta contra el
    terreno: si un camino sobresale del predio, la parte de afuera no
    descuenta área que nunca estuvo disponible.

    Devuelve metros cuadrados redondeados a dos decimales — el
    milímetro cuadrado no significa nada sobre un terreno.
    """
    poligono_terreno = _a_poligono(terreno, "El terreno")

    poligonos_camino = [
        _a_poligono(vertices, f"El camino {i + 1}")
        for i, vertices in enumerate(caminos)
    ]

    if poligonos_camino:
        union = unary_union(poligonos_camino)
        ocupada = union.intersection(poligono_terreno).area
    else:
        ocupada = 0.0

    bruta = poligono_terreno.area

    return {
        "area_bruta": round(bruta, 2),
        "area_caminos": round(ocupada, 2),
        "area_util": round(bruta - ocupada, 2),
    }


def camino_dentro_del_terreno(
    terreno: list[list[float]],
    camino: list[list[float]],
) -> bool:
    """
    Indica si un camino queda completamente dentro del predio.

    No es motivo de rechazo: un camino de acceso normalmente arranca
    fuera del terreno, en la vía pública. Sirve para advertir al usuario
    cuando la salida del predio parece no ser intencional.
    """
    return _a_poligono(terreno, "El terreno").contains(
        _a_poligono(camino, "El camino")
    )
