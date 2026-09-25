"""
Cálculo de materiales a partir de la configuración de un bloque (RF-06).

L: paneles en el largo (número par). A: paneles en el ancho.
B: número de bloques iguales.

`LOG` (logística) no entra aquí: es un valor fijo sin fórmula, se agrega
como línea aparte al armar la cotización, no depende de L/A/B.
"""


def calcular_materiales(L: int, A: int, B: int) -> dict[str, int]:
    """Calcula la cantidad de cada material para un ítem de cotización."""
    _validar_lab(L, A, B)

    var1650 = (L // 2) * (A + 1) * B
    var1350 = ((L // 2) + 1) * (A + 1) * B
    sop_v_e = (A + 1) * 2 * B
    ant_b = L * (A + 1) * B
    clamp_f = (L * 2) * 2 * B

    return {
        "VAR1650": var1650,
        "VAR1350": var1350,
        "HEX_V18MM": var1650 + var1350,
        "SOP_A": var1650,
        "SOP_V": var1350 - sop_v_e,
        "SOP_V_E": sop_v_e,
        "ANT_B": ant_b,
        "ANT_VAR": ant_b,
        "CLAMP_F": clamp_f,
        "CLAMP_I": (L * 2) * (A - 1) * B,
    }


def _validar_lab(L: int, A: int, B: int) -> None:
    if L <= 0 or L % 2 != 0:
        raise ValueError(f"L debe ser un número par mayor a 0 (recibido: {L})")
    if A <= 0:
        raise ValueError(f"A debe ser mayor a 0 (recibido: {A})")
    if B <= 0:
        raise ValueError(f"B debe ser mayor a 0 (recibido: {B})")
