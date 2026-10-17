"""Pruebas del historial de cotizaciones (RF-10)."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.cotizacion import Cotizacion, EstadoCotizacion, ItemCotizacion, MaterialCotizado
from app.models.material import Material
from app.services.cotizacion import listar_cotizaciones, obtener_cotizacion
from tests.fabricas import crear_usuario

HOY = datetime.now(timezone.utc)


def _crear_cotizacion(
    db: Session,
    *,
    cliente_nombre: str = "Cliente de prueba",
    estado: EstadoCotizacion = EstadoCotizacion.COTIZADA,
    total: Decimal = Decimal("100.00"),
    creada: datetime | None = None,
) -> Cotizacion:
    usuario = crear_usuario(db)
    cotizacion = Cotizacion(
        usuario_id=usuario.id,
        cliente_nombre=cliente_nombre,
        estado=estado,
        subtotal=total,
        addendum_monto=Decimal("0"),
        iva_porcentaje=Decimal("15"),
        iva_monto=Decimal("0"),
        total=total,
        items=[ItemCotizacion(paneles_largo=4, paneles_ancho=3, bloques=1)],
        created_at=creada or HOY,
    )
    db.add(cotizacion)
    db.flush()
    return cotizacion


def test_lista_de_mas_reciente_a_mas_antigua(db: Session) -> None:
    primera = _crear_cotizacion(db, creada=HOY - timedelta(days=2))
    segunda = _crear_cotizacion(db, creada=HOY - timedelta(days=1))
    tercera = _crear_cotizacion(db, creada=HOY)

    cotizaciones, total = listar_cotizaciones(db)

    assert total == 3
    assert [c.id for c in cotizaciones] == [tercera.id, segunda.id, primera.id]


def test_buscar_filtra_por_nombre_del_cliente_sin_distinguir_mayusculas(db: Session) -> None:
    _crear_cotizacion(db, cliente_nombre="Constructora Andina")
    _crear_cotizacion(db, cliente_nombre="Hormigones del Valle")

    cotizaciones, total = listar_cotizaciones(db, buscar="andina")

    assert total == 1
    assert cotizaciones[0].cliente_nombre == "Constructora Andina"


def test_buscar_cubre_clientes_cotizados_al_vuelo_sin_cliente_id(db: Session) -> None:
    """cliente_id es nullable: buscar debe andar igual contra el snapshot."""
    cotizacion = _crear_cotizacion(db, cliente_nombre="Llamada rápida SAS")
    assert cotizacion.cliente_id is None

    cotizaciones, total = listar_cotizaciones(db, buscar="llamada")

    assert total == 1
    assert cotizaciones[0].id == cotizacion.id


def test_filtra_por_estado(db: Session) -> None:
    _crear_cotizacion(db, estado=EstadoCotizacion.COTIZADA)
    despachada = _crear_cotizacion(db, estado=EstadoCotizacion.DESPACHADA)

    cotizaciones, total = listar_cotizaciones(db, estado=EstadoCotizacion.DESPACHADA)

    assert total == 1
    assert cotizaciones[0].id == despachada.id


def test_filtra_por_rango_de_fechas_inclusive(db: Session) -> None:
    hace_tres_dias = _crear_cotizacion(db, creada=HOY - timedelta(days=3))
    hoy = _crear_cotizacion(db, creada=HOY)
    _crear_cotizacion(db, creada=HOY - timedelta(days=10))

    cotizaciones, total = listar_cotizaciones(db, desde=(HOY - timedelta(days=3)).date(), hasta=date.today())

    assert total == 2
    assert {c.id for c in cotizaciones} == {hace_tres_dias.id, hoy.id}


def test_pagina_devuelve_el_total_real_no_solo_el_de_la_pagina(db: Session) -> None:
    for _ in range(5):
        _crear_cotizacion(db)

    cotizaciones, total = listar_cotizaciones(db, pagina=1, por_pagina=2)

    assert total == 5
    assert len(cotizaciones) == 2


def test_segunda_pagina_trae_los_siguientes(db: Session) -> None:
    creadas = [_crear_cotizacion(db, creada=HOY - timedelta(minutes=i)) for i in range(5)]

    primera_pagina, _ = listar_cotizaciones(db, pagina=1, por_pagina=2)
    segunda_pagina, _ = listar_cotizaciones(db, pagina=2, por_pagina=2)

    assert [c.id for c in primera_pagina] == [creadas[0].id, creadas[1].id]
    assert [c.id for c in segunda_pagina] == [creadas[2].id, creadas[3].id]


def test_obtener_cotizacion_trae_items_y_materiales(db: Session) -> None:
    material = Material(codigo="VAR1650", nombre="Varilla 1650mm", unidad="u")
    db.add(material)
    db.flush()

    cotizacion = _crear_cotizacion(db)
    cotizacion.materiales.append(
        MaterialCotizado(material_id=material.id, cantidad=8, precio_unitario=Decimal("7.20"))
    )
    db.flush()

    encontrada = obtener_cotizacion(db, cotizacion.id)

    assert encontrada is not None
    assert len(encontrada.items) == 1
    assert encontrada.items[0].paneles_largo == 4
    assert len(encontrada.materiales) == 1
    assert encontrada.materiales[0].material.codigo == "VAR1650"


def test_obtener_cotizacion_inexistente_devuelve_none(db: Session) -> None:
    assert obtener_cotizacion(db, 999999) is None
