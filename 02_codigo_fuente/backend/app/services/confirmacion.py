"""
Confirmación del diseño y paso a la cotización — RF-05.

El Gerente revisa el diagrama del layout (bloques, proporción, equipo) y
lo confirma explícitamente; recién entonces se calculan los materiales
(RF-06). Confirmar emite la cotización con los bloques del layout
agrupados en ítems L, A, B, como en la notación de HEXtructure.

Reglas (ficha RF-05 y prototipo):
  - Solo un layout vigente: si el terreno, los caminos, el panel o la
    latitud cambiaron después de generarlo, hay que volver a generarlo.
  - Los bloques fuera de la proporción antisísmica se aceptan "bajo
    responsabilidad" del Gerente: sin esa aceptación explícita no se
    cotiza.
  - Un proyecto se cotiza una vez. Volver a cotizarlo con otro número
    de proforma queda para cuando exista la revisión de proformas.
"""

from collections import Counter
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.cotizacion import Cotizacion
from app.models.layout import Layout
from app.models.proyecto import EstadoProyecto, Proyecto
from app.models.usuario import Usuario
from app.schemas.cotizacion import CotizacionCrear, ItemCalculoEntrada
from app.services.cotizacion import crear_cotizacion
from app.services.layout import huella_actual, obtener_layout


class NoSePuedeCotizar(ValueError):
    """El proyecto no está en condiciones de cotizarse; el mensaje dice qué falta."""


def items_del_layout(layout: Layout) -> list[ItemCalculoEntrada]:
    """
    Bloques iguales agrupados en ítems: L, A y B (cuántos bloques hay de
    ese tamaño). El orden sigue el de los tipos: el más repetido primero.
    """
    conteo = Counter((b.paneles_largo, b.paneles_ancho) for b in layout.bloques)
    return [
        ItemCalculoEntrada(paneles_largo=l, paneles_ancho=a, bloques=b)
        for (l, a), b in sorted(conteo.items(), key=lambda item: (-item[1], -item[0][1]))
    ]


def cotizar_layout(
    db: Session,
    proyecto_id: int,
    usuario: Usuario,
    *,
    acepta_fuera_de_proporcion: bool,
    addendum_porcentaje: Decimal = Decimal("0"),
) -> Cotizacion:
    """
    Confirma el layout del proyecto y emite su cotización.

    Bloquea la fila del proyecto mientras tanto: dos confirmaciones
    simultáneas (doble clic, dos pestañas) no pueden emitir dos
    cotizaciones. `crear_cotizacion` hace el commit y libera el bloqueo.
    """
    proyecto = db.query(Proyecto).filter(Proyecto.id == proyecto_id).with_for_update().one()

    if proyecto.estado == EstadoProyecto.COTIZADO:
        anterior = (
            db.query(Cotizacion)
            .filter(Cotizacion.proyecto_id == proyecto.id)
            .order_by(Cotizacion.created_at.desc(), Cotizacion.id.desc())
            .first()
        )
        numero = f" ({anterior.numero_proforma})" if anterior and anterior.numero_proforma else ""
        raise NoSePuedeCotizar(f"El proyecto ya tiene su cotización{numero}.")

    layout = obtener_layout(db, proyecto.id)
    if layout is None or not layout.bloques:
        raise NoSePuedeCotizar("Genera el layout del proyecto antes de confirmarlo.")
    if layout.huella != huella_actual(db, proyecto):
        raise NoSePuedeCotizar(
            "El terreno, los caminos, el panel o la latitud cambiaron después de generar el "
            "layout. Vuelve a generarlo antes de confirmarlo."
        )

    fuera = sum(1 for b in layout.bloques if not b.en_proporcion)
    if fuera and not acepta_fuera_de_proporcion:
        raise NoSePuedeCotizar(
            f"{fuera} bloque(s) están fuera de la proporción antisísmica. Ajústalos o "
            f"confírmalos bajo tu responsabilidad."
        )

    datos = CotizacionCrear(
        cliente_id=proyecto.cliente_id,
        proyecto_id=proyecto.id,
        proyecto_nombre=proyecto.nombre,
        addendum_porcentaje=addendum_porcentaje,
        items=items_del_layout(layout),
    )
    cotizacion, _ = crear_cotizacion(
        db,
        datos,
        usuario,
        potencia_kwp=round(layout.potencia_kwp, 2),
        total_paneles=layout.total_paneles,
    )
    return cotizacion
