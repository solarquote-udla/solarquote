"""
Arma el total de una cotización a partir de sus ítems (RF-06).

No toca base de datos: recibe los precios vigentes ya resueltos (el
backend los busca en PrecioMaterial) y solo calcula cantidades, subtotal
e IVA. Guardar la Cotización queda del lado del backend.

El % de IVA tampoco vive acá: lo manda el backend en cada request
(configurable desde ahí), este servicio solo lo aplica.

Los `cargos_fijos` (ej. LOG) se suman a `cantidades_totales` tal cual
los manda el backend, sin pasar por `calcular_materiales`: son cantidad
fija por cotización, no función de L/A/B.

`calcular_materiales` siempre calcula los 10 códigos de fórmula, sin
saber cuáles siguen activos — eso lo filtra `entrada.precios`: el
backend solo manda precio de los códigos activos (`crear_cotizacion`),
así que un código sin precio aquí es uno desactivado, y se excluye del
todo de la cotización, no es un error.
"""

from decimal import ROUND_HALF_UP, Decimal

from app.schemas.cotizacion import (
    CalcularCotizacionEntrada,
    CalcularCotizacionSalida,
    ItemCalculado,
)
from app.services.calculo_materiales import calcular_materiales

CENTAVOS = Decimal("0.01")


def _redondear(monto: Decimal) -> Decimal:
    return monto.quantize(CENTAVOS, rounding=ROUND_HALF_UP)


def armar_cotizacion(entrada: CalcularCotizacionEntrada) -> CalcularCotizacionSalida:
    items_calculados: list[ItemCalculado] = []
    cantidades_totales: dict[str, int] = {}

    for item in entrada.items:
        cantidades = {
            codigo: cantidad
            for codigo, cantidad in calcular_materiales(
                L=item.paneles_largo,
                A=item.paneles_ancho,
                B=item.bloques,
            ).items()
            if codigo in entrada.precios
        }
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

    for codigo, cantidad in entrada.cargos_fijos.items():
        if codigo in entrada.precios:
            cantidades_totales[codigo] = cantidades_totales.get(codigo, 0) + cantidad

    subtotal = sum(
        (entrada.precios[codigo] * cantidad for codigo, cantidad in cantidades_totales.items()),
        start=Decimal("0"),
    )

    iva_monto = subtotal * entrada.iva_porcentaje / Decimal("100")
    total = subtotal + iva_monto

    return CalcularCotizacionSalida(
        items=items_calculados,
        cantidades_totales=cantidades_totales,
        subtotal=_redondear(subtotal),
        iva_porcentaje=entrada.iva_porcentaje,
        iva_monto=_redondear(iva_monto),
        total=_redondear(total),
    )
