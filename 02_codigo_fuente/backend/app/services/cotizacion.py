"""
Orquestación de cotizaciones — RF-06, SQ-77 parte 3/3.

Junta las dos partes anteriores: resuelve el precio vigente de cada
material activo, llama a calc-service, y persiste la Cotización con
sus ítems (L, A, B) y el desglose (subtotal, IVA, total, y la cantidad
+ precio unitario de cada material) tal como salió de calc-service en
ese momento — es un snapshot, no se recalcula después.
"""

from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.fechas import ZONA_ECUADOR
from app.core.texto import escapar_comodines_ilike
from app.models.cliente import Cliente
from app.models.cotizacion import Cotizacion, EstadoCotizacion, ItemCotizacion, MaterialCotizado, TramoPagoCotizacion
from app.models.material import Material
from app.models.proyecto import Proyecto
from app.models.usuario import Usuario
from app.schemas.cotizacion import CondicionesProforma, CotizacionCrear, ItemCalculoEntrada, ResultadoCalculoCotizacion
from app.services.calc_service import calcular_via_calc_service
from app.services.material import (
    CODIGOS_FORMULA,
    obtener_precios_vigentes,
    obtener_precios_vigentes_opcionales,
)
from app.services.proforma import siguiente_numero_proforma
from app.services.proyecto import ClienteNoDisponible, avanzar_a_cotizado

# Cantidad fija de logística por cotización (SQ-76): no escala con L/A/B.
CODIGO_LOGISTICA = "LOG"
CANTIDAD_LOGISTICA = 1


class ProyectoNoDisponible(ValueError):
    """El proyecto indicado no existe."""


def crear_cotizacion(
    db: Session,
    datos: CotizacionCrear,
    usuario: Usuario,
    *,
    potencia_kwp: float | None = None,
    total_paneles: int | None = None,
) -> tuple[Cotizacion, ResultadoCalculoCotizacion]:
    """
    Calcula y emite la cotización. `potencia_kwp` y `total_paneles` solo
    se conocen cuando sale de un layout (RF-05); el número de proforma se
    asigna aquí, al emitirla.
    """
    cliente: Cliente | None = None
    if datos.cliente_id is not None:
        cliente = db.get(Cliente, datos.cliente_id)
        if cliente is None:
            raise ClienteNoDisponible(f"No existe el cliente {datos.cliente_id}")
        if not cliente.activo:
            raise ClienteNoDisponible(
                f"El cliente {cliente.nombre} está dado de baja y no admite cotizaciones nuevas"
            )

    proyecto: Proyecto | None = None
    if datos.proyecto_id is not None:
        proyecto = db.get(Proyecto, datos.proyecto_id)
        if proyecto is None:
            raise ProyectoNoDisponible(f"No existe el proyecto {datos.proyecto_id}")

    # Los precios se piden solo de los códigos de fórmula que siguen
    # activos (+ LOG): un material de fórmula desactivado queda fuera de
    # las cotizaciones nuevas, igual que uno que no participa del cálculo
    # o uno nuevo sin precio todavía — ninguno de esos casos debe bloquear
    # una cotización.
    filas = db.query(Material.id, Material.codigo, Material.activo).all()
    material_id_por_codigo = {fila.codigo: fila.id for fila in filas}
    codigos_formula_activos = {fila.codigo for fila in filas if fila.activo and fila.codigo in CODIGOS_FORMULA}

    precios = obtener_precios_vigentes(db, sorted(codigos_formula_activos))
    precios.update(obtener_precios_vigentes_opcionales(db, [CODIGO_LOGISTICA]))

    cargos_fijos = {CODIGO_LOGISTICA: CANTIDAD_LOGISTICA} if CODIGO_LOGISTICA in precios else {}

    resultado = calcular_via_calc_service(
        items=[
            ItemCalculoEntrada(
                paneles_largo=item.paneles_largo,
                paneles_ancho=item.paneles_ancho,
                bloques=item.bloques,
            )
            for item in datos.items
        ],
        precios=precios,
        cargos_fijos=cargos_fijos,
        iva_porcentaje=settings.IVA_PORCENTAJE,
    )

    if cliente is not None:
        cliente_nombre = cliente.nombre
        cliente_email = cliente.email
        cliente_telefono = cliente.telefono
    else:
        cliente_nombre = datos.cliente_nombre
        cliente_email = datos.cliente_email
        cliente_telefono = datos.cliente_telefono

    condiciones = datos.condiciones or CondicionesProforma()
    plazo_dias = condiciones.plazo_dias if condiciones.plazo_dias is not None else settings.PROFORMA_PLAZO_DIAS
    validez_dias = condiciones.validez_dias if condiciones.validez_dias is not None else settings.PROFORMA_VALIDEZ_DIAS
    garantia_anios = (
        condiciones.garantia_anios if condiciones.garantia_anios is not None else settings.PROFORMA_GARANTIA_ANIOS
    )
    if condiciones.pagos is not None:
        tramos_pago = [(tramo.nombre, tramo.porcentaje) for tramo in condiciones.pagos]
    else:
        tramos_pago = [
            ("Anticipo", settings.PROFORMA_PAGO_ANTICIPO_PCT),
            ("Entrega", settings.PROFORMA_PAGO_ENTREGA_PCT),
            ("A 60 días de la entrega", settings.PROFORMA_PAGO_60_DIAS_PCT),
        ]

    # Informativo: el precio por Wp que el cliente compara contra el de
    # referencia del mercado. Se calcula, no se edita (SQ-213/Joseph) —
    # nulo si la cotización no tiene potencia (al vuelo, sin layout).
    precio_wp = (
        (resultado.subtotal / (Decimal(str(potencia_kwp)) * 1000)).quantize(Decimal("0.0001"))
        if potencia_kwp is not None and potencia_kwp > 0
        else None
    )

    cotizacion = Cotizacion(
        numero_proforma=siguiente_numero_proforma(db),
        potencia_kwp=potencia_kwp,
        total_paneles=total_paneles,
        usuario_id=usuario.id,
        cliente_id=datos.cliente_id,
        proyecto_id=datos.proyecto_id,
        cliente_nombre=cliente_nombre,
        cliente_email=cliente_email,
        cliente_telefono=cliente_telefono,
        proyecto_nombre=datos.proyecto_nombre,
        subtotal=resultado.subtotal,
        iva_porcentaje=resultado.iva_porcentaje,
        iva_monto=resultado.iva_monto,
        total=resultado.total,
        plazo_dias=plazo_dias,
        validez_dias=validez_dias,
        garantia_anios=garantia_anios,
        precio_wp=precio_wp,
        pagos=[
            TramoPagoCotizacion(orden=orden, nombre=nombre, porcentaje=porcentaje)
            for orden, (nombre, porcentaje) in enumerate(tramos_pago)
        ],
        items=[
            ItemCotizacion(
                paneles_largo=item.paneles_largo,
                paneles_ancho=item.paneles_ancho,
                bloques=item.bloques,
            )
            for item in datos.items
        ],
        materiales=[
            MaterialCotizado(
                material_id=material_id_por_codigo[codigo],
                cantidad=cantidad,
                precio_unitario=precios[codigo],
            )
            for codigo, cantidad in resultado.cantidades_totales.items()
        ],
    )
    db.add(cotizacion)

    if proyecto is not None:
        avanzar_a_cotizado(proyecto)

    db.commit()
    db.refresh(cotizacion)

    return cotizacion, resultado


# ─── Historial (RF-10) ───────────────────────────────────────────────


def listar_cotizaciones(
    db: Session,
    *,
    buscar: str | None = None,
    estado: EstadoCotizacion | None = None,
    desde: date | None = None,
    hasta: date | None = None,
    pagina: int = 1,
    por_pagina: int = 20,
) -> tuple[list[Cotizacion], int]:
    """
    Listado del historial, del más reciente al más antiguo.

    `buscar` es texto libre contra el nombre del cliente en el snapshot
    (no contra el catálogo `Cliente`): así cubre también las cotizaciones
    hechas al vuelo, sin `cliente_id`. También busca en `numero_proforma`,
    ya que RF-10 pide poder encontrar una cotización por su proforma.
    `desde`/`hasta` filtran por la fecha de emisión (`created_at`),
    inclusive en los dos extremos.
    """
    query = db.query(Cotizacion)
    if buscar:
        patron = f"%{escapar_comodines_ilike(buscar)}%"
        query = query.filter(
            or_(
                Cotizacion.cliente_nombre.ilike(patron, escape="\\"),
                Cotizacion.numero_proforma.ilike(patron, escape="\\"),
            )
        )
    if estado is not None:
        query = query.filter(Cotizacion.estado == estado)
    if desde is not None:
        query = query.filter(Cotizacion.created_at >= datetime.combine(desde, time.min, tzinfo=ZONA_ECUADOR))
    if hasta is not None:
        query = query.filter(Cotizacion.created_at <= datetime.combine(hasta, time.max, tzinfo=ZONA_ECUADOR))

    total = query.count()
    cotizaciones = (
        query.order_by(Cotizacion.created_at.desc(), Cotizacion.id.desc())
        .offset((pagina - 1) * por_pagina)
        .limit(por_pagina)
        .all()
    )
    return cotizaciones, total


def obtener_cotizacion(db: Session, cotizacion_id: int) -> Cotizacion | None:
    """Detalle completo de una cotización, con sus ítems, materiales y tramos de pago."""
    return (
        db.query(Cotizacion)
        .options(
            selectinload(Cotizacion.items),
            selectinload(Cotizacion.materiales).selectinload(MaterialCotizado.material),
            selectinload(Cotizacion.pagos),
        )
        .filter(Cotizacion.id == cotizacion_id)
        .one_or_none()
    )
