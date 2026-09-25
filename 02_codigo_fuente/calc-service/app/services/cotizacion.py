"""
Arma el total de una cotización a partir de sus ítems (RF-06).

No toca base de datos: recibe los precios vigentes ya resueltos (el
backend los busca en PrecioMaterial) y solo calcula cantidades, subtotal,
addendum y IVA. Guardar la Cotización queda del lado del backend.
"""

from decimal import ROUND_HALF_UP, Decimal

from app.schemas.cotizacion import (
    CalcularCotizacionEntrada,
    CalcularCotizacionSalida,
    ItemCalculado,
)
from app.services.calculo_materiales import calcular_materiales

IVA_PORCENTAJE = Decimal("15")

CENTAVOS = Decimal("0.01")


def _redondear(monto: Decimal) -> Decimal:
    return monto.quantize(CENTAVOS, rounding=ROUND_HALF_UP)


def armar_cotizacion(entrada: CalcularCotizacionEntrada) -> CalcularCotizacionSalida:
    items_calculados: list[ItemCalculado] = []
    cantidades_totales: dict[str, int] = {}

    for item in entrada.items:
        cantidades = calcular_materiales(
            L=item.paneles_largo,
            A=item.paneles_ancho,
            B=item.bloques,
        )
        items_calculados.append(
            ItemCalculado(
                paneles_largo=item.paneles_largo,
                paneles_ancho=item.paneles_ancho,
                bloques=item.bloques,
                cantidades=cantidades,
            )
        )
        for codigo, cantidad in cantidades.items():
            cantidades_totales[codigo] = cantidades_totales.get(codigo, 0) + cantidad

    faltantes = sorted(set(cantidades_totales) - set(entrada.precios))
    if faltantes:
        raise ValueError(f"Faltan precios para los materiales: {', '.join(faltantes)}")

    subtotal = sum(
        (entrada.precios[codigo] * cantidad for codigo, cantidad in cantidades_totales.items()),
        start=Decimal("0"),
    )

    addendum_monto = subtotal * entrada.addendum_porcentaje / Decimal("100")
    base_con_addendum = subtotal + addendum_monto
    iva_monto = base_con_addendum * IVA_PORCENTAJE / Decimal("100")
    total = base_con_addendum + iva_monto

    return CalcularCotizacionSalida(
        items=items_calculados,
        cantidades_totales=cantidades_totales,
        subtotal=_redondear(subtotal),
        addendum_porcentaje=entrada.addendum_porcentaje,
        addendum_monto=_redondear(addendum_monto),
        iva_porcentaje=IVA_PORCENTAJE,
        iva_monto=_redondear(iva_monto),
        total=_redondear(total),
    )
