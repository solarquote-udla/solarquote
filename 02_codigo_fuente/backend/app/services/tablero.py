"""
Indicadores del tablero — RF-13.

Los cuatro indicadores del backlog, calculados sobre `Cotizacion` y
`MaterialCotizado`: cotizaciones emitidas por periodo, su distribución
por estado, los clientes más frecuentes y los materiales de mayor
consumo. Son reportes derivados de las mismas cotizaciones que ya
protege `HISTORIAL`/`GENERAR_LAYOUT`, no un módulo nuevo — por eso el
router exige el mismo permiso que el historial, sin uno propio.

Los cuatro comparten el mismo rango `desde`/`hasta` (igual convención
que el filtro de fechas del historial, RF-10: inclusive en los dos
extremos, en hora de Ecuador): un tablero de 3 meses no puede mostrar
"clientes más frecuentes" de toda la historia junto a cotizaciones de
ese rango, sería un reporte contradictorio. Sin `desde`/`hasta`, el
rango por defecto son los últimos `MESES_POR_DEFECTO` meses.

"Clientes más frecuentes" agrupa por `cliente_nombre` (el snapshot de
la cotización, no la FK `cliente_id`): así cuenta igual a un cliente
del catálogo que a uno cotizado al vuelo, igual que el filtro `buscar`
del historial en RF-10.
"""

from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.fechas import ZONA_ECUADOR
from app.models.cotizacion import Cotizacion, EstadoCotizacion, ItemCotizacion, MaterialCotizado
from app.models.material import Material
from app.schemas.tablero import (
    ClienteFrecuenteLeer,
    CotizacionesPorEstadoLeer,
    CotizacionesPorPeriodoLeer,
    MaterialConsumidoLeer,
    ResumenTableroLeer,
    TableroLeer,
)

MESES_POR_DEFECTO = 6
MESES_MAXIMO = 24  # cuántos meses puede abarcar como máximo desde/hasta
TOP_POR_DEFECTO = 5


class RangoInvalido(ValueError):
    """`desde` es posterior a `hasta`, o el rango abarca demasiados meses."""


def _restar_meses(anio: int, mes: int, n: int) -> tuple[int, int]:
    """(año, mes) de hace `n` meses, con `mes` siempre entre 1 y 12."""
    indice = anio * 12 + (mes - 1) - n
    return indice // 12, indice % 12 + 1


def _meses_entre(desde: date, hasta: date) -> list[tuple[int, int]]:
    """Un (año, mes) por cada mes entre `desde` y `hasta`, inclusive y en orden."""
    total = (hasta.year * 12 + hasta.month) - (desde.year * 12 + desde.month) + 1
    return [_restar_meses(hasta.year, hasta.month, total - 1 - i) for i in range(total)]


def _resolver_rango(desde: date | None, hasta: date | None) -> tuple[date, date]:
    """Completa lo que falte (último día de hoy, últimos MESES_POR_DEFECTO) y valida."""
    hasta = hasta or datetime.now(ZONA_ECUADOR).date()
    if desde is None:
        anio, mes = _restar_meses(hasta.year, hasta.month, MESES_POR_DEFECTO - 1)
        desde = date(anio, mes, 1)

    if desde > hasta:
        raise RangoInvalido("'desde' no puede ser posterior a 'hasta'.")
    if len(_meses_entre(desde, hasta)) > MESES_MAXIMO:
        raise RangoInvalido(f"El rango no puede abarcar más de {MESES_MAXIMO} meses.")
    return desde, hasta


def _cotizaciones_por_periodo(
    db: Session, desde_dt: datetime, hasta_dt: datetime, meses: list[tuple[int, int]]
) -> list[CotizacionesPorPeriodoLeer]:
    # Un periodo por mes, en orden, ya en cero: así el gráfico muestra
    # los meses sin cotizaciones en vez de saltárselos.
    periodos = {f"{anio:04d}-{mes:02d}": {"cantidad": 0, "total": Decimal("0")} for anio, mes in meses}

    filas = (
        db.query(Cotizacion.created_at, Cotizacion.total)
        .filter(Cotizacion.created_at >= desde_dt, Cotizacion.created_at <= hasta_dt)
        .all()
    )
    for creado_en, total in filas:
        local = creado_en.astimezone(ZONA_ECUADOR)
        clave = f"{local.year:04d}-{local.month:02d}"
        if clave in periodos:
            periodos[clave]["cantidad"] += 1
            periodos[clave]["total"] += total or Decimal("0")

    return [
        CotizacionesPorPeriodoLeer(periodo=periodo, cantidad=datos["cantidad"], total=datos["total"])
        for periodo, datos in periodos.items()
    ]


def _cotizaciones_por_estado(db: Session, desde_dt: datetime, hasta_dt: datetime) -> list[CotizacionesPorEstadoLeer]:
    conteos = dict(
        db.query(Cotizacion.estado, func.count())
        .filter(Cotizacion.created_at >= desde_dt, Cotizacion.created_at <= hasta_dt)
        .group_by(Cotizacion.estado)
        .all()
    )
    return [
        CotizacionesPorEstadoLeer(estado=estado, cantidad=conteos.get(estado, 0)) for estado in EstadoCotizacion
    ]


def _clientes_frecuentes(db: Session, desde_dt: datetime, hasta_dt: datetime, top: int) -> list[ClienteFrecuenteLeer]:
    filas = (
        db.query(Cotizacion.cliente_nombre, func.count().label("cantidad"))
        .filter(Cotizacion.created_at >= desde_dt, Cotizacion.created_at <= hasta_dt)
        .group_by(Cotizacion.cliente_nombre)
        .order_by(func.count().desc(), Cotizacion.cliente_nombre)
        .limit(top)
        .all()
    )
    return [ClienteFrecuenteLeer(cliente_nombre=nombre, cantidad=cantidad) for nombre, cantidad in filas]


def _materiales_mas_consumidos(
    db: Session, desde_dt: datetime, hasta_dt: datetime, top: int
) -> list[MaterialConsumidoLeer]:
    filas = (
        db.query(
            Material.id,
            Material.codigo,
            Material.nombre,
            func.sum(MaterialCotizado.cantidad).label("cantidad"),
        )
        .join(MaterialCotizado, MaterialCotizado.material_id == Material.id)
        .join(Cotizacion, Cotizacion.id == MaterialCotizado.cotizacion_id)
        .filter(Cotizacion.created_at >= desde_dt, Cotizacion.created_at <= hasta_dt)
        .group_by(Material.id, Material.codigo, Material.nombre)
        .order_by(func.sum(MaterialCotizado.cantidad).desc(), Material.codigo)
        .limit(top)
        .all()
    )
    return [
        MaterialConsumidoLeer(material_id=id_, codigo=codigo, nombre=nombre, cantidad=int(cantidad))
        for id_, codigo, nombre, cantidad in filas
    ]


def _resumen(db: Session, desde_dt: datetime, hasta_dt: datetime) -> ResumenTableroLeer:
    total_cotizaciones, monto_total = (
        db.query(func.count(Cotizacion.id), func.coalesce(func.sum(Cotizacion.total), 0))
        .filter(Cotizacion.created_at >= desde_dt, Cotizacion.created_at <= hasta_dt)
        .one()
    )
    paneles_cotizados = (
        db.query(
            func.coalesce(
                func.sum(ItemCotizacion.paneles_largo * ItemCotizacion.paneles_ancho * ItemCotizacion.bloques), 0
            )
        )
        .join(Cotizacion, Cotizacion.id == ItemCotizacion.cotizacion_id)
        .filter(Cotizacion.created_at >= desde_dt, Cotizacion.created_at <= hasta_dt)
        .scalar()
    )
    return ResumenTableroLeer(
        total_cotizaciones=total_cotizaciones,
        monto_total=monto_total,
        paneles_cotizados=int(paneles_cotizados),
    )


def obtener_tablero(
    db: Session, *, desde: date | None = None, hasta: date | None = None, top: int = TOP_POR_DEFECTO
) -> TableroLeer:
    desde, hasta = _resolver_rango(desde, hasta)
    desde_dt = datetime.combine(desde, time.min, tzinfo=ZONA_ECUADOR)
    hasta_dt = datetime.combine(hasta, time.max, tzinfo=ZONA_ECUADOR)
    meses = _meses_entre(desde, hasta)

    return TableroLeer(
        resumen=_resumen(db, desde_dt, hasta_dt),
        cotizaciones_por_periodo=_cotizaciones_por_periodo(db, desde_dt, hasta_dt, meses),
        cotizaciones_por_estado=_cotizaciones_por_estado(db, desde_dt, hasta_dt),
        clientes_frecuentes=_clientes_frecuentes(db, desde_dt, hasta_dt, top),
        materiales_mas_consumidos=_materiales_mas_consumidos(db, desde_dt, hasta_dt, top),
    )
