"""
Orquestación de cotizaciones — RF-06, SQ-77 parte 3/3.

Junta las dos partes anteriores: resuelve el precio vigente de cada
material activo, llama a calc-service, y persiste la Cotización con
sus ítems (L, A, B) y el desglose (subtotal, IVA, total, y la cantidad
+ precio unitario de cada material) tal como salió de calc-service en
ese momento — es un snapshot, no se recalcula después.
"""

from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.texto import escapar_comodines_ilike
from app.models.cliente import Cliente
from app.models.cotizacion import Cotizacion, EstadoCotizacion, ItemCotizacion, MaterialCotizado
from app.models.material import Material
from app.models.proyecto import Proyecto
from app.models.usuario import Usuario
from app.schemas.cotizacion import CotizacionCrear, ItemCalculoEntrada, ResultadoCalculoCotizacion
from app.services.calc_service import calcular_via_calc_service
from app.services.material import (
    CODIGOS_FORMULA,
    obtener_precios_vigentes,
    obtener_precios_vigentes_opcionales,
)
from app.services.proyecto import ClienteNoDisponible, avanzar_a_cotizado

# Cantidad fija de logística por cotización (SQ-76): no escala con L/A/B.
CODIGO_LOGISTICA = "LOG"
CANTIDAD_LOGISTICA = 1

# Ecuador no usa horario de verano: UTC-5 todo el año.
ZONA_ECUADOR = timezone(timedelta(hours=-5))


class ProyectoNoDisponible(ValueError):
    """El proyecto indicado no existe."""


def crear_cotizacion(
    db: Session,
    datos: CotizacionCrear,
    usuario: Usuario,
) -> tuple[Cotizacion, ResultadoCalculoCotizacion]:
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

    # Los precios se piden solo de los códigos que usan las fórmulas (+ LOG),
    # no de "todo material activo": un material nuevo sin precio todavía, o
    # uno que no participa del cálculo, no debe bloquear ninguna cotización.
    filas = db.query(Material.id, Material.codigo).all()
    material_id_por_codigo = {fila.codigo: fila.id for fila in filas}

    precios = obtener_precios_vigentes(db, sorted(CODIGOS_FORMULA))
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
        addendum_porcentaje=datos.addendum_porcentaje,
        iva_porcentaje=settings.IVA_PORCENTAJE,
    )

    if cliente is not None:
        cliente_nombre = cliente.nombre
        cliente_empresa = cliente.empresa
        cliente_email = cliente.email
        cliente_telefono = cliente.telefono
    else:
        cliente_nombre = datos.cliente_nombre
        cliente_empresa = datos.cliente_empresa
        cliente_email = datos.cliente_email
        cliente_telefono = datos.cliente_telefono

    cotizacion = Cotizacion(
        usuario_id=usuario.id,
        cliente_id=datos.cliente_id,
        proyecto_id=datos.proyecto_id,
        cliente_nombre=cliente_nombre,
        cliente_empresa=cliente_empresa,
        cliente_email=cliente_email,
        cliente_telefono=cliente_telefono,
        proyecto_nombre=datos.proyecto_nombre,
        addendum_porcentaje=datos.addendum_porcentaje,
        subtotal=resultado.subtotal,
        addendum_monto=resultado.addendum_monto,
        iva_porcentaje=resultado.iva_porcentaje,
        iva_monto=resultado.iva_monto,
        total=resultado.total,
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
    """Detalle completo de una cotización, con sus ítems y materiales."""
    return (
        db.query(Cotizacion)
        .options(
            selectinload(Cotizacion.items),
            selectinload(Cotizacion.materiales).selectinload(MaterialCotizado.material),
        )
        .filter(Cotizacion.id == cotizacion_id)
        .one_or_none()
    )
