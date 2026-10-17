"""Pruebas de los indicadores del tablero (RF-13)."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.cotizacion import Cotizacion, EstadoCotizacion, MaterialCotizado
from app.models.material import Material
from app.services.tablero import ZONA_ECUADOR, _restar_meses, obtener_tablero
from tests.fabricas import crear_usuario


def _usuario_id(db: Session) -> int:
    # Un único usuario por prueba basta: el tablero no distingue autoría.
    if not hasattr(db, "_usuario_tablero_id"):
        db._usuario_tablero_id = crear_usuario(db).id
    return db._usuario_tablero_id


def _crear_cotizacion(
    db: Session,
    *,
    cliente_nombre: str = "Cliente de prueba",
    estado: EstadoCotizacion = EstadoCotizacion.COTIZADA,
    total: str = "100.00",
    created_at: datetime,
) -> Cotizacion:
    cotizacion = Cotizacion(
        usuario_id=_usuario_id(db),
        cliente_nombre=cliente_nombre,
        estado=estado,
        total=Decimal(total),
        created_at=created_at,
    )
    db.add(cotizacion)
    db.flush()
    return cotizacion


def _crear_material(db: Session, codigo: str) -> Material:
    material = Material(codigo=codigo, nombre=codigo)
    db.add(material)
    db.flush()
    return material


def test_restar_meses_cruza_el_cambio_de_anio() -> None:
    assert _restar_meses(2026, 2, 1) == (2026, 1)
    assert _restar_meses(2026, 1, 1) == (2025, 12)
    assert _restar_meses(2026, 1, 13) == (2024, 12)


def test_cotizaciones_por_periodo_agrupa_por_mes_y_rellena_meses_vacios(db: Session) -> None:
    ahora = datetime.now(ZONA_ECUADOR)
    _crear_cotizacion(db, total="100.00", created_at=ahora)
    _crear_cotizacion(db, total="50.00", created_at=ahora)

    tablero = obtener_tablero(db, meses=3, top=5)

    assert [p.periodo for p in tablero.cotizaciones_por_periodo] == sorted(
        p.periodo for p in tablero.cotizaciones_por_periodo
    )
    assert len(tablero.cotizaciones_por_periodo) == 3
    ultimo = tablero.cotizaciones_por_periodo[-1]
    assert ultimo.periodo == f"{ahora.year:04d}-{ahora.month:02d}"
    assert ultimo.cantidad == 2
    assert ultimo.total == Decimal("150.00")
    # Los meses anteriores sin cotizaciones quedan en cero, no se omiten.
    assert tablero.cotizaciones_por_periodo[0].cantidad == 0


def test_cotizaciones_por_periodo_no_incluye_fuera_de_rango(db: Session) -> None:
    anio, mes = _restar_meses(datetime.now(ZONA_ECUADOR).year, datetime.now(ZONA_ECUADOR).month, 6)
    fuera_de_rango = datetime(anio, mes, 15, tzinfo=ZONA_ECUADOR)
    _crear_cotizacion(db, created_at=fuera_de_rango)

    tablero = obtener_tablero(db, meses=3, top=5)

    assert sum(p.cantidad for p in tablero.cotizaciones_por_periodo) == 0


def test_cotizaciones_por_estado_incluye_todos_los_estados_aunque_esten_en_cero(db: Session) -> None:
    ahora = datetime.now(ZONA_ECUADOR)
    _crear_cotizacion(db, estado=EstadoCotizacion.COTIZADA, created_at=ahora)
    _crear_cotizacion(db, estado=EstadoCotizacion.COTIZADA, created_at=ahora)
    _crear_cotizacion(db, estado=EstadoCotizacion.INSTALADA, created_at=ahora)

    tablero = obtener_tablero(db, meses=1, top=5)

    por_estado = {item.estado: item.cantidad for item in tablero.cotizaciones_por_estado}
    assert por_estado == {
        EstadoCotizacion.COTIZADA: 2,
        EstadoCotizacion.DESPACHADA: 0,
        EstadoCotizacion.RECIBIDA: 0,
        EstadoCotizacion.INSTALADA: 1,
    }


def test_clientes_frecuentes_ordena_de_mas_a_menos_y_respeta_el_top(db: Session) -> None:
    ahora = datetime.now(ZONA_ECUADOR)
    for _ in range(3):
        _crear_cotizacion(db, cliente_nombre="Constructora Andina", created_at=ahora)
    for _ in range(2):
        _crear_cotizacion(db, cliente_nombre="Hormigones del Valle", created_at=ahora)
    _crear_cotizacion(db, cliente_nombre="Cliente único", created_at=ahora)

    tablero = obtener_tablero(db, meses=1, top=2)

    assert [c.cliente_nombre for c in tablero.clientes_frecuentes] == [
        "Constructora Andina",
        "Hormigones del Valle",
    ]
    assert tablero.clientes_frecuentes[0].cantidad == 3


def test_los_cuatro_indicadores_comparten_la_misma_ventana_de_meses(db: Session) -> None:
    """
    Revisión propia: antes `meses` solo acotaba "cotizaciones por
    periodo" y los otros tres indicadores siempre miraban toda la
    historia — un tablero a 1 mes mezclaba un gráfico de ese mes con
    "clientes más frecuentes" de años atrás.
    """
    ahora = datetime.now(ZONA_ECUADOR)
    anio, mes = _restar_meses(ahora.year, ahora.month, 6)
    fuera_de_rango = datetime(anio, mes, 15, tzinfo=ZONA_ECUADOR)

    material = _crear_material(db, "VAR1650")
    vieja = _crear_cotizacion(
        db, cliente_nombre="Cliente viejo", estado=EstadoCotizacion.INSTALADA, created_at=fuera_de_rango
    )
    db.add(MaterialCotizado(cotizacion_id=vieja.id, material_id=material.id, cantidad=50, precio_unitario=Decimal("1.00")))
    db.flush()

    tablero = obtener_tablero(db, meses=1, top=5)

    assert tablero.clientes_frecuentes == []
    assert tablero.materiales_mas_consumidos == []
    assert all(item.cantidad == 0 for item in tablero.cotizaciones_por_estado)


def test_materiales_mas_consumidos_suma_entre_cotizaciones_y_respeta_el_top(db: Session) -> None:
    ahora = datetime.now(ZONA_ECUADOR)
    varilla = _crear_material(db, "VAR1650")
    grapa = _crear_material(db, "GRAPA_X")
    c1 = _crear_cotizacion(db, created_at=ahora)
    c2 = _crear_cotizacion(db, created_at=ahora)
    db.add(MaterialCotizado(cotizacion_id=c1.id, material_id=varilla.id, cantidad=8, precio_unitario=Decimal("7.20")))
    db.add(MaterialCotizado(cotizacion_id=c2.id, material_id=varilla.id, cantidad=4, precio_unitario=Decimal("7.20")))
    db.add(MaterialCotizado(cotizacion_id=c1.id, material_id=grapa.id, cantidad=2, precio_unitario=Decimal("1.00")))
    db.flush()

    tablero = obtener_tablero(db, meses=1, top=1)

    assert len(tablero.materiales_mas_consumidos) == 1
    assert tablero.materiales_mas_consumidos[0].codigo == "VAR1650"
    assert tablero.materiales_mas_consumidos[0].cantidad == 12
