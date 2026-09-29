"""
Cálculos de la configuración de equipo — RF-02.

Funciones puras, sin base de datos, para poder probarlas con números
verificables a mano. Implementan lo que el documento de titulación pide
en el proceso de RF-02:

  1. Área física por panel
  2. Distancia mínima entre filas según el ángulo de montaje
  3. Límites de paneles por string a partir de panel e inversor

La sugerencia de cantidad de inversores (~400 paneles por inversor)
también está en RF-02, pero necesita el número total de paneles, que
recién existe cuando RF-03 genera el layout. La regla queda aquí para
que RF-03 la use, pero no se expone todavía.
"""

import math
from dataclasses import dataclass

# Inclinación del eje terrestre. Fija el punto más bajo que alcanza el
# sol al mediodía a lo largo del año.
DECLINACION_MAXIMA = 23.44

# Regla de dimensionamiento de HEXtructure (documento de titulación, RF-02).
PANELES_POR_INVERSOR = 400

# Tolerancia para evitar que 1100 / 50 = 21.999999… se redondee a 21.
_EPSILON = 1e-9


def area_panel_m2(largo_mm: float, ancho_mm: float) -> float:
    """Superficie física de un panel, en metros cuadrados."""
    return (largo_mm / 1000) * (ancho_mm / 1000)


# ─── Separación entre filas ─────────────────────────────────────────


def elevacion_solar_minima(latitud: float) -> float:
    """
    Altura del sol al mediodía solar en el día más desfavorable del año.

    Al mediodía la elevación es 90° − |φ − δ|. El peor caso se da en el
    solsticio del hemisferio opuesto, cuando la declinación δ se aleja
    todo lo posible de la latitud φ: 90° − (|φ| + 23,44°).

    En Ecuador (φ entre −5° y +1,5°) resulta entre 61,5° y 66,5°: el sol
    siempre pasa alto, y por eso las sombras entre filas son cortas.
    """
    return 90.0 - (abs(latitud) + DECLINACION_MAXIMA)


@dataclass(frozen=True)
class Separacion:
    """
    Geometría de una fila inclinada y la sombra que proyecta.

    Todas las longitudes en metros, para un panel en posición vertical
    (lado largo en dirección de la pendiente). RF-03 escala el resultado
    por la cantidad de paneles que la fila tenga en profundidad, usando
    `factor_sombra`.
    """

    elevacion_solar_grados: float
    altura_m: float
    proyeccion_m: float
    sombra_m: float
    paso_minimo_m: float
    factor_sombra: float


def separacion_entre_filas(
    profundidad_m: float,
    angulo_montaje: float,
    latitud: float,
) -> Separacion:
    """
    Distancia mínima para que una fila no sombree a la siguiente.

    Para un panel de profundidad D inclinado un ángulo β, con el sol a
    una elevación α:

        altura      h = D · sen β
        proyección  p = D · cos β       (lo que ocupa en planta)
        sombra      s = h / tan α       (hueco libre hasta la otra fila)
        paso        p + s               (de borde frontal a borde frontal)

    Se evalúa al mediodía del peor día del año. Es el criterio más
    común, pero no protege de las sombras de primera y última hora,
    cuando el sol está bajo. Aceptarlo o ampliar la separación es una
    decisión de diseño de cada proyecto.
    """
    alfa = elevacion_solar_minima(latitud)
    beta = math.radians(angulo_montaje)
    tan_alfa = math.tan(math.radians(alfa))

    altura = profundidad_m * math.sin(beta)
    proyeccion = profundidad_m * math.cos(beta)
    sombra = altura / tan_alfa

    return Separacion(
        elevacion_solar_grados=alfa,
        altura_m=altura,
        proyeccion_m=proyeccion,
        sombra_m=sombra,
        paso_minimo_m=proyeccion + sombra,
        # Sombra por metro de profundidad de la fila. Como todo es lineal
        # en D, RF-03 obtiene la sombra de una fila de n paneles con
        # n · D · factor, sin recalcular trigonometría.
        factor_sombra=math.sin(beta) / tan_alfa,
    )


# ─── Límites de string ──────────────────────────────────────────────


@dataclass(frozen=True)
class LimitesString:
    paneles_min: int
    paneles_max: int
    compatible: bool
    motivo: str | None


def limites_string(
    vmax_inversor: float,
    vmin_inversor: float,
    voc_panel: float,
    vmp_panel: float,
) -> LimitesString:
    """
    Cuántos paneles admite un string en serie para este inversor.

        máximo = floor(Vmax_inversor / Voc_panel)
        mínimo = ceil(Vmin_inversor / Vmp_panel)

    Fórmulas del documento de titulación (proceso de RF-03). El máximo
    usa Voc porque es el voltaje del string en vacío, el más alto que
    verá el inversor; el mínimo usa Vmp porque es el voltaje en
    operación, que debe alcanzar el umbral de arranque.

    Limitación conocida: el Voc es el de la ficha, a 25 °C. En frío el
    Voc sube, y un string en el límite puede superar el Vmax del
    inversor en una madrugada fría. Se respeta la fórmula aprobada y se
    advierte en la interfaz; el dimensionamiento eléctrico definitivo
    corresponde al instalador.
    """
    maximo = math.floor(vmax_inversor / voc_panel + _EPSILON)
    minimo = math.ceil(vmin_inversor / vmp_panel - _EPSILON)

    if maximo < 1:
        return LimitesString(
            paneles_min=minimo,
            paneles_max=maximo,
            compatible=False,
            motivo=(
                "El Voc de un solo panel ya supera el voltaje máximo del "
                "inversor. No es posible formar ningún string."
            ),
        )

    if minimo > maximo:
        return LimitesString(
            paneles_min=minimo,
            paneles_max=maximo,
            compatible=False,
            motivo=(
                f"Se necesitan al menos {minimo} paneles para alcanzar el "
                f"voltaje mínimo del inversor, pero con más de {maximo} se "
                f"supera el máximo. No hay un largo de string que cumpla ambos."
            ),
        )

    return LimitesString(
        paneles_min=max(minimo, 1),
        paneles_max=maximo,
        compatible=True,
        motivo=None,
    )


def inversores_sugeridos(total_paneles: int) -> int:
    """
    Regla de HEXtructure: aproximadamente un inversor cada 400 paneles.

    La usará RF-03, que es donde se conoce el total de paneles.
    """
    if total_paneles <= 0:
        return 0
    return math.ceil(total_paneles / PANELES_POR_INVERSOR)
