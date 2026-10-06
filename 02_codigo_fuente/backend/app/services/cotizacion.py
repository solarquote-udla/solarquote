"""
Orquestación de cotizaciones — RF-06, SQ-77 parte 3/3.

Junta las dos partes anteriores: resuelve el precio vigente de cada
material activo, llama a calc-service, y persiste la Cotización con
sus ítems (L, A, B) y el desglose (subtotal, IVA, total, y la cantidad
+ precio unitario de cada material) tal como salió de calc-service en
ese momento — es un snapshot, no se recalcula después.
"""

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.cliente import Cliente
from app.models.cotizacion import Cotizacion, ItemCotizacion, MaterialCotizado
from app.models.material import Material
from app.models.proyecto import Proyecto
from app.models.usuario import Usuario
from app.schemas.cotizacion import CotizacionCrear, ItemCalculoEntrada, ResultadoCalculoCotizacion
from app.services.calc_service import calcular_via_calc_service
from app.services.material import obtener_precios_vigentes
from app.services.proyecto import ClienteNoDisponible

# Cantidad fija de logística por cotización (SQ-76): no escala con L/A/B.
CODIGO_LOGISTICA = "LOG"
CANTIDAD_LOGISTICA = 1


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

    if datos.proyecto_id is not None:
        proyecto = db.get(Proyecto, datos.proyecto_id)
        if proyecto is None:
            raise ProyectoNoDisponible(f"No existe el proyecto {datos.proyecto_id}")

    filas = db.query(Material.id, Material.codigo).filter(Material.activo.is_(True)).all()
    material_id_por_codigo = {fila.codigo: fila.id for fila in filas}
    codigos_activos = list(material_id_por_codigo)
    precios = obtener_precios_vigentes(db, codigos_activos)

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
    db.commit()
    db.refresh(cotizacion)

    return cotizacion, resultado
