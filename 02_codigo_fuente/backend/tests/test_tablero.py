"""Pruebas de los indicadores del tablero (RF-13)."""

from datetime import date, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import crear_access_token
from app.main import app
from app.models.boceto import Boceto
from app.models.cliente import Cliente, TipoIdentificacion
from app.models.cotizacion import Cotizacion, EstadoCotizacion, ItemCotizacion, MaterialCotizado
from app.models.proyecto import Proyecto
from app.models.material import Material
from app.services.tablero import RangoInvalido, ZONA_ECUADOR, _meses_entre, _restar_meses, obtener_tablero
from tests.fabricas import crear_usuario


def _usuario_id(db: Session) -> int:
    # Un único usuario por prueba basta: el tablero no distingue autoría.
    if not hasattr(db, "_usuario_tablero_id"):
        db._usuario_tablero_id = crear_usuario(db).id
    return db._usuario_tablero_id


def _cabecera(usuario) -> dict[str, str]:
    token = crear_access_token(usuario_id=usuario.id, version=usuario.version_token)
    return {"Authorization": f"Bearer {token}"}


def _crear_cotizacion(
    db: Session,
    *,
    cliente_nombre: str = "Cliente de prueba",
    estado: EstadoCotizacion = EstadoCotizacion.COTIZADA,
    total: str = "100.00",
    potencia_kwp: str | None = None,
    created_at: datetime,
    items: list[tuple[int, int, int]] = (),
) -> Cotizacion:
    cotizacion = Cotizacion(
        usuario_id=_usuario_id(db),
        cliente_nombre=cliente_nombre,
        estado=estado,
        total=Decimal(total),
        potencia_kwp=Decimal(potencia_kwp) if potencia_kwp is not None else None,
        created_at=created_at,
        # La base exige la fecha de instalación en las instaladas (RF-16)
        instalada_at=created_at if estado == EstadoCotizacion.INSTALADA else None,
        items=[
            ItemCotizacion(paneles_largo=largo, paneles_ancho=ancho, bloques=bloques)
            for largo, ancho, bloques in items
        ],
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


def test_meses_entre_es_inclusive_en_los_dos_extremos() -> None:
    assert _meses_entre(date(2026, 8, 15), date(2026, 10, 1)) == [(2026, 8), (2026, 9), (2026, 10)]
    assert _meses_entre(date(2026, 10, 1), date(2026, 10, 31)) == [(2026, 10)]
    assert _meses_entre(date(2025, 12, 1), date(2026, 1, 31)) == [(2025, 12), (2026, 1)]


def test_sin_desde_ni_hasta_usa_los_ultimos_seis_meses(db: Session) -> None:
    ahora = datetime.now(ZONA_ECUADOR)
    _crear_cotizacion(db, total="100.00", created_at=ahora)

    tablero = obtener_tablero(db)

    assert len(tablero.cotizaciones_por_periodo) == 6
    assert tablero.cotizaciones_por_periodo[-1].periodo == f"{ahora.year:04d}-{ahora.month:02d}"
    assert tablero.cotizaciones_por_periodo[-1].cantidad == 1


def test_desde_posterior_a_hasta_lanza_rango_invalido(db: Session) -> None:
    with pytest.raises(RangoInvalido):
        obtener_tablero(db, desde=date(2026, 10, 1), hasta=date(2026, 1, 1))


def test_rango_de_mas_de_24_meses_lanza_rango_invalido(db: Session) -> None:
    with pytest.raises(RangoInvalido):
        obtener_tablero(db, desde=date(2020, 1, 1), hasta=date(2026, 10, 1))


def test_cotizaciones_por_periodo_agrupa_por_mes_y_rellena_meses_vacios(db: Session) -> None:
    ahora = datetime.now(ZONA_ECUADOR)
    _crear_cotizacion(db, total="100.00", created_at=ahora)
    _crear_cotizacion(db, total="50.00", created_at=ahora)
    anio_desde, mes_desde = _restar_meses(ahora.year, ahora.month, 2)

    tablero = obtener_tablero(db, desde=date(anio_desde, mes_desde, 1), hasta=ahora.date())

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
    ahora = datetime.now(ZONA_ECUADOR)
    anio, mes = _restar_meses(ahora.year, ahora.month, 6)
    fuera_de_rango = datetime(anio, mes, 15, tzinfo=ZONA_ECUADOR)
    _crear_cotizacion(db, created_at=fuera_de_rango)
    anio_desde, mes_desde = _restar_meses(ahora.year, ahora.month, 2)

    tablero = obtener_tablero(db, desde=date(anio_desde, mes_desde, 1), hasta=ahora.date())

    assert sum(p.cantidad for p in tablero.cotizaciones_por_periodo) == 0


def test_hasta_excluye_cotizaciones_posteriores(db: Session) -> None:
    ahora = datetime.now(ZONA_ECUADOR)
    anio, mes = _restar_meses(ahora.year, ahora.month, 1)
    dentro_del_rango = datetime(anio, mes, 15, tzinfo=ZONA_ECUADOR)
    _crear_cotizacion(db, created_at=dentro_del_rango)
    _crear_cotizacion(db, created_at=ahora)  # posterior al "hasta" de la prueba

    tablero = obtener_tablero(db, desde=date(anio, mes, 1), hasta=date(anio, mes, 28), top=5)

    assert sum(p.cantidad for p in tablero.cotizaciones_por_periodo) == 1


def test_cotizaciones_por_estado_incluye_todos_los_estados_aunque_esten_en_cero(db: Session) -> None:
    ahora = datetime.now(ZONA_ECUADOR)
    _crear_cotizacion(db, estado=EstadoCotizacion.COTIZADA, created_at=ahora)
    _crear_cotizacion(db, estado=EstadoCotizacion.COTIZADA, created_at=ahora)
    _crear_cotizacion(db, estado=EstadoCotizacion.INSTALADA, created_at=ahora)

    tablero = obtener_tablero(db, desde=ahora.date(), hasta=ahora.date())

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

    tablero = obtener_tablero(db, desde=ahora.date(), hasta=ahora.date(), top=2)

    assert [c.cliente_nombre for c in tablero.clientes_frecuentes] == [
        "Constructora Andina",
        "Hormigones del Valle",
    ]
    assert tablero.clientes_frecuentes[0].cantidad == 3


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

    tablero = obtener_tablero(db, desde=ahora.date(), hasta=ahora.date(), top=1)

    assert len(tablero.materiales_mas_consumidos) == 1
    assert tablero.materiales_mas_consumidos[0].codigo == "VAR1650"
    assert tablero.materiales_mas_consumidos[0].cantidad == 12


def test_resumen_cuenta_cotizaciones_y_suma_el_monto(db: Session) -> None:
    ahora = datetime.now(ZONA_ECUADOR)
    _crear_cotizacion(db, total="100.00", created_at=ahora)
    _crear_cotizacion(db, total="50.50", created_at=ahora)

    tablero = obtener_tablero(db, desde=ahora.date(), hasta=ahora.date())

    assert tablero.resumen.total_cotizaciones == 2
    assert tablero.resumen.monto_total == Decimal("150.50")


def test_resumen_suma_paneles_cotizados_como_largo_por_ancho_por_bloques(db: Session) -> None:
    ahora = datetime.now(ZONA_ECUADOR)
    # 4x3 paneles, 2 bloques iguales = 24; más un segundo ítem de 2x2x1 = 4.
    _crear_cotizacion(db, created_at=ahora, items=[(4, 3, 2), (2, 2, 1)])

    tablero = obtener_tablero(db, desde=ahora.date(), hasta=ahora.date())

    assert tablero.resumen.paneles_cotizados == 28


def test_resumen_suma_la_potencia_kwp_de_las_cotizaciones_que_la_tienen(db: Session) -> None:
    ahora = datetime.now(ZONA_ECUADOR)
    # Una cotización al vuelo, sin layout detrás, no tiene potencia_kwp.
    _crear_cotizacion(db, created_at=ahora, potencia_kwp="12.60")
    _crear_cotizacion(db, created_at=ahora, potencia_kwp="5.40")
    _crear_cotizacion(db, created_at=ahora)

    tablero = obtener_tablero(db, desde=ahora.date(), hasta=ahora.date())

    assert tablero.resumen.potencia_total_kwp == Decimal("18.00")


def test_resumen_sin_cotizaciones_en_el_rango_queda_en_cero(db: Session) -> None:
    ahora = datetime.now(ZONA_ECUADOR)

    tablero = obtener_tablero(db, desde=ahora.date(), hasta=ahora.date())

    assert tablero.resumen.total_cotizaciones == 0
    assert tablero.resumen.monto_total == Decimal("0")
    assert tablero.resumen.paneles_cotizados == 0
    assert tablero.resumen.potencia_total_kwp == Decimal("0")


def test_los_cuatro_indicadores_y_el_resumen_comparten_el_mismo_rango(db: Session) -> None:
    """
    Revisión propia: antes el rango solo acotaba "cotizaciones por
    periodo" y los otros tres indicadores siempre miraban toda la
    historia — un tablero de 1 mes mezclaba un gráfico de ese mes con
    "clientes más frecuentes" de años atrás.
    """
    ahora = datetime.now(ZONA_ECUADOR)
    anio, mes = _restar_meses(ahora.year, ahora.month, 6)
    fuera_de_rango = datetime(anio, mes, 15, tzinfo=ZONA_ECUADOR)

    material = _crear_material(db, "VAR1650")
    vieja = _crear_cotizacion(
        db,
        cliente_nombre="Cliente viejo",
        estado=EstadoCotizacion.INSTALADA,
        created_at=fuera_de_rango,
        items=[(4, 3, 1)],
        potencia_kwp="9.00",
    )
    db.add(MaterialCotizado(cotizacion_id=vieja.id, material_id=material.id, cantidad=50, precio_unitario=Decimal("1.00")))
    db.flush()

    tablero = obtener_tablero(db, desde=ahora.date(), hasta=ahora.date(), top=5)

    assert tablero.clientes_frecuentes == []
    assert tablero.materiales_mas_consumidos == []
    assert all(item.cantidad == 0 for item in tablero.cotizaciones_por_estado)
    assert tablero.resumen.total_cotizaciones == 0
    assert tablero.resumen.paneles_cotizados == 0
    assert tablero.resumen.potencia_total_kwp == Decimal("0")


# ─── Router: RangoInvalido -> 422 ────────────────────────────────────


@pytest.fixture
def api(db: Session):
    app.dependency_overrides[get_db] = lambda: db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_desde_posterior_a_hasta_responde_422(api, db: Session) -> None:
    sesion = _cabecera(crear_usuario(db))

    r = api.get("/api/tablero", params={"desde": "2026-10-01", "hasta": "2026-01-01"}, headers=sesion)

    assert r.status_code == 422
    assert "desde" in r.json()["detail"]


def test_rango_de_mas_de_24_meses_responde_422(api, db: Session) -> None:
    sesion = _cabecera(crear_usuario(db))

    r = api.get("/api/tablero", params={"desde": "2000-01-01", "hasta": "2026-10-01"}, headers=sesion)

    assert r.status_code == 422


def test_resumen_cuenta_los_bocetos_procesados_en_el_rango(db: Session) -> None:
    """RF-13: número de bocetos procesados del período."""
    ahora = datetime.now(ZONA_ECUADOR)
    cliente = Cliente(nombre="Cliente tablero", tipo_identificacion=TipoIdentificacion.RUC, identificacion="1710034065001")
    db.add(cliente)
    db.flush()
    for i, cuando in enumerate([ahora, ahora, datetime(2020, 1, 15, tzinfo=ZONA_ECUADOR)]):
        proyecto = Proyecto(nombre=f"Proyecto {i}", cliente_id=cliente.id, usuario_id=_usuario_id(db))
        db.add(proyecto)
        db.flush()
        db.add(
            Boceto(
                proyecto_id=proyecto.id, usuario_id=_usuario_id(db), nombre_archivo="b.pdf", formato="pdf",
                tamano_bytes=4, contenido=b"%PDF", metodo="ia", advertencias=[], created_at=cuando,
            )
        )
    db.flush()

    tablero = obtener_tablero(db, desde=ahora.date(), hasta=ahora.date())

    assert tablero.resumen.bocetos_procesados == 2
