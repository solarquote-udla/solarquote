"""
Cálculos de la configuración de equipo — RF-02.

Funciones puras, sin base de datos, para poder probarlas con números
verificables a mano:

  1. Área física por panel.
  2. Límites de paneles por string a partir de panel e inversor.
  3. Paneles que admite un inversor por sus entradas (MPPT, strings).
  4. Relación DC/AC y sugerencia de inversores.
  5. Si la potencia objetivo cabe en el terreno.

Revisión del 25 de noviembre (Lenin, Santi y Anita): los inversores no
se cuentan con una regla fija de paneles, sino por su potencia y sus
entradas; tener más potencia en inversores que en paneles es una reserva
para ampliaciones, no un error; y los inversores los decide la ingeniería
del proyecto, así que todo esto es una referencia que nunca bloquea. El
cálculo del sol y la sombra se quitó: no cambia la estructura y el
cliente no lo usa.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass

# Relación DC/AC (kWp de paneles ÷ kW de inversores) desde la que los
# inversores recortan producción en las horas de más sol. En plantas
# grandes suele estar entre 1,13 y 1,30 (EIA, 2018) y NREL usa 1,28.
RELACION_DC_AC_MAXIMA = 1.3

# Tolerancia para evitar que 1100 / 50 = 21.999999… se redondee a 21.
_EPSILON = 1e-9


def area_panel_m2(largo_mm: float, ancho_mm: float) -> float:
    """Superficie física de un panel, en metros cuadrados."""
    return (largo_mm / 1000) * (ancho_mm / 1000)


def numero_es(valor: float, decimales: int = 0) -> str:
    """Número con formato de Ecuador para los mensajes: 1.234,5."""
    texto = f"{valor:,.{decimales}f}"
    return texto.replace(",", "_").replace(".", ",").replace("_", ".")


def paneles_para_potencia(potencia_kwp: float, potencia_panel_wp: float) -> int:
    """Paneles necesarios para una potencia: kWp × 1000 ÷ Wp, hacia arriba."""
    return math.ceil(potencia_kwp * 1000 / potencia_panel_wp - _EPSILON)


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

    El Voc es el de la ficha, a 25 °C. El dimensionamiento eléctrico
    definitivo lo hace la ingeniería del proyecto (En el Power): aquí
    sirve para estimar cuántos paneles admite cada inversor.
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


# ─── Inversores ─────────────────────────────────────────────────────


@dataclass(frozen=True)
class InversorElectrico:
    potencia_kw: float
    vmax_v: float | None = None
    vmin_v: float | None = None
    mppts: int | None = None
    strings_por_mppt: int | None = None


def paneles_que_admite(inversor: InversorElectrico, voc_panel: float | None, vmp_panel: float | None) -> int | None:
    """
    Paneles que admite el inversor por sus entradas:
    MPPT × strings por MPPT × paneles por string (el máximo por voltaje).
    None si faltan datos del inversor o del panel.
    """
    if not (inversor.mppts and inversor.strings_por_mppt and inversor.vmax_v and inversor.vmin_v):
        return None
    if not (voc_panel and vmp_panel):
        return None
    limites = limites_string(inversor.vmax_v, inversor.vmin_v, voc_panel, vmp_panel)
    if not limites.compatible:
        return 0
    return inversor.mppts * inversor.strings_por_mppt * limites.paneles_max


@dataclass(frozen=True)
class AnalisisInversores:
    paneles: int
    potencia_dc_kwp: float
    potencia_ac_kw: float
    relacion_dc_ac: float
    # "reserva" (DC/AC < 1), "normal" o "recorte" (DC/AC > relacion_maxima)
    estado: str
    relacion_maxima: float
    # Suma de lo que admiten las entradas; None si a algún inversor le faltan datos
    paneles_admitidos: int | None
    # Inversores sugeridos con el modelo del inversor 1, y la cuenta que lo explica
    sugeridos: int
    cuenta: str
    mensajes: list[str]


def analizar_inversores(
    paneles: int,
    potencia_panel_wp: float,
    inversores: Sequence[InversorElectrico],
    voc_panel: float | None = None,
    vmp_panel: float | None = None,
    relacion_maxima: float = RELACION_DC_AC_MAXIMA,
) -> AnalisisInversores | None:
    """
    Relación DC/AC, entradas y sugerencia de inversores para `paneles`.

    - relación DC/AC = kWp de los paneles ÷ kW de los inversores.
    - Menor que 1: los inversores dejan reserva para ampliaciones.
    - Mayor que `relacion_maxima`: en las horas de más sol los inversores
      recortarían la producción.
    - Sugeridos (con el modelo del inversor 1): el mayor entre
      kWp ÷ (kW × relacion_maxima) y paneles ÷ paneles que admite.
    """
    if paneles <= 0 or not inversores or potencia_panel_wp <= 0:
        return None
    potencia_dc = paneles * potencia_panel_wp / 1000
    potencia_ac = sum(i.potencia_kw for i in inversores)
    if potencia_ac <= 0:
        return None
    relacion = potencia_dc / potencia_ac
    estado = "reserva" if relacion < 1 - _EPSILON else "recorte" if relacion > relacion_maxima + _EPSILON else "normal"

    admiten = [paneles_que_admite(i, voc_panel, vmp_panel) for i in inversores]
    admitidos = sum(admiten) if all(a is not None for a in admiten) else None

    modelo = inversores[0]
    por_potencia = potencia_dc / (modelo.potencia_kw * relacion_maxima)
    partes = [
        f"{numero_es(potencia_dc, 1)} kWp ÷ ({numero_es(modelo.potencia_kw, 0)} kW × "
        f"{numero_es(relacion_maxima, 1)}) = {numero_es(por_potencia, 2)}"
    ]
    sugeridos = math.ceil(por_potencia - _EPSILON)
    admite_modelo = admiten[0]
    if admite_modelo:
        por_entradas = paneles / admite_modelo
        partes.append(
            f"{numero_es(paneles)} paneles ÷ {numero_es(admite_modelo)} que admite cada uno = "
            f"{numero_es(por_entradas, 2)}"
        )
        sugeridos = max(sugeridos, math.ceil(por_entradas - _EPSILON))
    sugeridos = max(sugeridos, 1)
    cuenta = "; ".join(partes) + f". Se toma el mayor, hacia arriba: {sugeridos}."

    mensajes: list[str] = []
    if estado == "reserva":
        mensajes.append(
            f"Los inversores suman {numero_es(potencia_ac)} kW y los paneles {numero_es(potencia_dc, 1)} kWp "
            f"(relación DC/AC {numero_es(relacion, 2)}): queda reserva para ampliaciones."
        )
    elif estado == "recorte":
        mensajes.append(
            f"Los paneles ({numero_es(potencia_dc, 1)} kWp) superan a los inversores ({numero_es(potencia_ac)} kW) "
            f"en un {numero_es((relacion - 1) * 100)} % (relación DC/AC {numero_es(relacion, 2)}; lo habitual es hasta "
            f"{numero_es(relacion_maxima, 1)}): en las horas de más sol los inversores recortarían la producción. "
            f"Con el modelo del inversor 1 se sugieren {sugeridos}."
        )
    if admitidos is not None and paneles > admitidos:
        mensajes.append(
            f"Las entradas de los inversores admiten {numero_es(admitidos)} paneles (MPPT × strings por MPPT × "
            f"paneles por string) y hay {numero_es(paneles)}: faltan entradas. Con el modelo del inversor 1 se "
            f"sugieren {sugeridos}."
        )
    return AnalisisInversores(
        paneles=paneles,
        potencia_dc_kwp=round(potencia_dc, 2),
        potencia_ac_kw=round(potencia_ac, 2),
        relacion_dc_ac=round(relacion, 3),
        estado=estado,
        relacion_maxima=relacion_maxima,
        paneles_admitidos=admitidos,
        sugeridos=sugeridos,
        cuenta=cuenta,
        mensajes=mensajes,
    )


# ─── Potencia objetivo frente al terreno ────────────────────────────


@dataclass(frozen=True)
class Ocupacion:
    paneles: int
    area_paneles_m2: float
    area_terreno_m2: float
    porcentaje: float
    cabe: bool
    # Paneles que entrarían en el terreno pegados, sin pasillos (cota superior)
    maximo_paneles: int
    mensaje: str | None


def ocupacion_terreno(
    paneles: int, largo_mm: float, ancho_mm: float, potencia_panel_wp: float, area_terreno_m2: float
) -> Ocupacion | None:
    """
    Si los paneles de la potencia objetivo caben en el terreno.

    Superficie de paneles = paneles × largo × ancho. Si supera el área
    útil del terreno, no caben ni pegados unos a otros. Si cabe, el
    número final lo da el Paso 3, porque los pasillos y la forma del
    terreno reducen lo que entra.
    """
    if paneles <= 0 or area_terreno_m2 <= 0:
        return None
    area_panel = area_panel_m2(largo_mm, ancho_mm)
    area_paneles = paneles * area_panel
    maximo = math.floor(area_terreno_m2 / area_panel + _EPSILON)
    cabe = area_paneles <= area_terreno_m2 + _EPSILON
    mensaje = None
    if not cabe:
        mensaje = (
            f"No caben: {numero_es(paneles)} paneles ocupan {numero_es(area_paneles)} m² y el terreno útil tiene "
            f"{numero_es(area_terreno_m2)} m². Aun sin pasillos, entran como máximo {numero_es(maximo)} paneles "
            f"({numero_es(maximo * potencia_panel_wp / 1000, 1)} kWp)."
        )
    return Ocupacion(
        paneles=paneles,
        area_paneles_m2=round(area_paneles, 2),
        area_terreno_m2=round(area_terreno_m2, 2),
        porcentaje=round(area_paneles / area_terreno_m2 * 100, 1),
        cabe=cabe,
        maximo_paneles=maximo,
        mensaje=mensaje,
    )
