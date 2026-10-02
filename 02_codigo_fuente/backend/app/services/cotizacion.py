"""
Orquestación de cotizaciones — RF-06, SQ-77 parte 3/3.

Junta las dos partes anteriores: resuelve el precio vigente de cada
material activo, llama a calc-service, y persiste la Cotización con
sus ítems (L, A, B). El desglose de calc-service no se guarda — ver
`CotizacionLeer.calculo` en el schema.
"""

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.cliente import Cliente
from app.models.cotizacion import Cotizacion, ItemCotizacion
from app.models.material import Material
from app.models.usuario import Usuario
from app.schemas.cotizacion import CotizacionCrear, ItemCalculoEntrada, ResultadoCalculoCotizacion
from app.services.calc_service import calcular_via_calc_service
from app.services.material import obtener_precios_vigentes
from app.services.proyecto import ClienteNoDisponible

# Cantidad fija de logística por cotización (SQ-76): no escala con L/A/B.
CODIGO_LOGISTICA = "LOG"
CANTIDAD_LOGISTICA = 1


def crear_cotizacion(
    db: Session,
    datos: CotizacionCrear,
    usuario: Usuario,
) -> tuple[Cotizacion, ResultadoCalculoCotizacion]:
    if datos.cliente_id is not None:
        cliente = db.get(Cliente, datos.cliente_id)
        if cliente is None:
            raise ClienteNoDisponible(f"No existe el cliente {datos.cliente_id}")

    filas = db.query(Material.codigo).filter(Material.activo.is_(True)).all()
    codigos_activos = [fila.codigo for fila in filas]
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

    cotizacion = Cotizacion(
        usuario_id=usuario.id,
        cliente_id=datos.cliente_id,
        proyecto_id=datos.proyecto_id,
        cliente_nombre=datos.cliente_nombre,
        cliente_empresa=datos.cliente_empresa,
        cliente_email=datos.cliente_email,
        cliente_telefono=datos.cliente_telefono,
        proyecto_nombre=datos.proyecto_nombre,
        addendum_porcentaje=datos.addendum_porcentaje,
        items=[
            ItemCotizacion(
                paneles_largo=item.paneles_largo,
                paneles_ancho=item.paneles_ancho,
                bloques=item.bloques,
            )
            for item in datos.items
        ],
    )
    db.add(cotizacion)
    db.commit()
    db.refresh(cotizacion)

    return cotizacion, resultado
