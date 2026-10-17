"""
Indicadores del tablero — RF-13.

Los cuatro indicadores del backlog, calculados sobre `Cotizacion` y
`MaterialCotizado`: cotizaciones emitidas por periodo, su distribución
por estado, los clientes más frecuentes y los materiales de mayor
consumo. Son reportes derivados de las mismas cotizaciones que ya
protege `HISTORIAL`/`GENERAR_LAYOUT`, no un módulo nuevo — por eso el
router exige el mismo permiso que el historial, sin uno propio.

Los cuatro comparten la misma ventana de `meses`: un tablero filtrado
a 1 mes no puede mostrar "clientes más frecuentes" de toda la historia
junto a cotizaciones de ese único mes, sería un reporte contradictorio.

"Clientes más frecuentes" agrupa por `cliente_nombre` (el snapshot de
la cotización, no la FK `cliente_id`): así cuenta igual a un cliente
del catálogo que a uno cotizado al vuelo, igual que el filtro `buscar`
del historial en RF-10.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.cotizacion import Cotizacion, EstadoCotizacion, MaterialCotizado
from app.models.material import Material
from app.schemas.tablero import (
    ClienteFrecuenteLeer,
    CotizacionesPorEstadoLeer,
    CotizacionesPorPeriodoLeer,
    MaterialConsumidoLeer,
    TableroLeer,
)

# Ecuador no usa horario de verano: UTC-5 todo el año. (Mismo criterio
# que el filtro de fechas del historial, en services/cotizacion.py.)
ZONA_ECUADOR = timezone(timedelta(hours=-5))

MESES_POR_DEFECTO = 6
TOP_POR_DEFECTO = 5


def _restar_meses(anio: int, mes: int, n: int) -> tuple[int, int]:
    """(año, mes) de hace `n` meses, con `mes` siempre entre 1 y 12."""
    indice = anio * 12 + (mes - 1) - n
    return indice // 12, indice % 12 + 1


def _desde(meses: int) -> datetime:
    ahora = datetime.now(ZONA_ECUADOR)
    anio_desde, mes_desde = _restar_meses(ahora.year, ahora.month, meses - 1)
    return datetime(anio_desde, mes_desde, 1, tzinfo=ZONA_ECUADOR)


def _cotizaciones_por_periodo(db: Session, desde: datetime, meses: int) -> list[CotizacionesPorPeriodoLeer]:
    ahora = datetime.now(ZONA_ECUADOR)

    # Un periodo por mes, en orden, ya en cero: así el gráfico muestra
    # los meses sin cotizaciones en vez de saltárselos.
    periodos = {}
    for i in range(meses):
        anio, mes = _restar_meses(ahora.year, ahora.month, meses - 1 - i)
        periodos[f"{anio:04d}-{mes:02d}"] = {"cantidad": 0, "total": Decimal("0")}

    filas = db.query(Cotizacion.created_at, Cotizacion.total).filter(Cotizacion.created_at >= desde).all()
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


def _cotizaciones_por_estado(db: Session, desde: datetime) -> list[CotizacionesPorEstadoLeer]:
    conteos = dict(
        db.query(Cotizacion.estado, func.count())
        .filter(Cotizacion.created_at >= desde)
        .group_by(Cotizacion.estado)
        .all()
    )
    return [
        CotizacionesPorEstadoLeer(estado=estado, cantidad=conteos.get(estado, 0)) for estado in EstadoCotizacion
    ]


def _clientes_frecuentes(db: Session, desde: datetime, top: int) -> list[ClienteFrecuenteLeer]:
    filas = (
        db.query(Cotizacion.cliente_nombre, func.count().label("cantidad"))
        .filter(Cotizacion.created_at >= desde)
        .group_by(Cotizacion.cliente_nombre)
        .order_by(func.count().desc(), Cotizacion.cliente_nombre)
        .limit(top)
        .all()
    )
    return [ClienteFrecuenteLeer(cliente_nombre=nombre, cantidad=cantidad) for nombre, cantidad in filas]


def _materiales_mas_consumidos(db: Session, desde: datetime, top: int) -> list[MaterialConsumidoLeer]:
    filas = (
        db.query(
            Material.id,
            Material.codigo,
            Material.nombre,
            func.sum(MaterialCotizado.cantidad).label("cantidad"),
        )
        .join(MaterialCotizado, MaterialCotizado.material_id == Material.id)
        .join(Cotizacion, Cotizacion.id == MaterialCotizado.cotizacion_id)
        .filter(Cotizacion.created_at >= desde)
        .group_by(Material.id, Material.codigo, Material.nombre)
        .order_by(func.sum(MaterialCotizado.cantidad).desc(), Material.codigo)
        .limit(top)
        .all()
    )
    return [
        MaterialConsumidoLeer(material_id=id_, codigo=codigo, nombre=nombre, cantidad=int(cantidad))
        for id_, codigo, nombre, cantidad in filas
    ]


def obtener_tablero(db: Session, *, meses: int = MESES_POR_DEFECTO, top: int = TOP_POR_DEFECTO) -> TableroLeer:
    desde = _desde(meses)
    return TableroLeer(
        cotizaciones_por_periodo=_cotizaciones_por_periodo(db, desde, meses),
        cotizaciones_por_estado=_cotizaciones_por_estado(db, desde),
        clientes_frecuentes=_clientes_frecuentes(db, desde, top),
        materiales_mas_consumidos=_materiales_mas_consumidos(db, desde, top),
    )
