"""Pruebas del orquestador de cotizaciones (RF-06, SQ-77 parte 3/3)."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import httpx
import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.models.cliente import Cliente, TipoIdentificacion
from app.models.cotizacion import EstadoCotizacion
from app.models.material import Material, PrecioMaterial
from app.models.proyecto import Proyecto
from app.models.usuario import RolUsuario, Usuario
from app.schemas.cotizacion import CotizacionCrear, ItemCalculoEntrada
from app.services.cotizacion import ProyectoNoDisponible, crear_cotizacion
from app.services.material import PrecioVigenteFaltante
from app.services.proyecto import ClienteNoDisponible

AYER = datetime.now(timezone.utc) - timedelta(days=1)

RESPUESTA_CALC_SERVICE = {
    "items": [
        {
            "paneles_largo": 4,
            "paneles_ancho": 3,
            "bloques": 1,
            "cantidades": {"VAR1650": 8},
        }
    ],
    "cantidades_totales": {"VAR1650": 8, "LOG": 1},
    "subtotal": "93.60",
    "addendum_porcentaje": "0",
    "addendum_monto": "0.00",
    "iva_porcentaje": "15",
    "iva_monto": "14.04",
    "total": "107.64",
}


def _crear_material_con_precio(db: Session, codigo: str, precio: Decimal, activo: bool = True) -> Material:
    material = Material(codigo=codigo, nombre=codigo, activo=activo)
    db.add(material)
    db.flush()
    db.add(PrecioMaterial(material_id=material.id, precio=precio, vigente_desde=AYER, vigente_hasta=None))
    db.flush()
    return material


def _crear_usuario(db: Session) -> Usuario:
    usuario = Usuario(
        nombre="Gerente de prueba",
        email=f"gerente-{datetime.now().timestamp()}@example.com",
        password_hash="hash-no-usado-en-este-test",
        rol=RolUsuario.GERENTE_GENERAL,
    )
    db.add(usuario)
    db.flush()
    return usuario


def _mock_calc_service_ok(monkeypatch: pytest.MonkeyPatch) -> dict:
    llamada = {}

    def _post_falso(url, *, json, timeout):
        llamada["json"] = json
        return httpx.Response(200, json=RESPUESTA_CALC_SERVICE)

    monkeypatch.setattr(httpx, "post", _post_falso)
    return llamada


def _datos_minimos() -> CotizacionCrear:
    return CotizacionCrear(
        cliente_nombre="Cliente de prueba",
        items=[ItemCalculoEntrada(paneles_largo=4, paneles_ancho=3, bloques=1)],
    )


def test_cliente_nombre_es_obligatorio_sin_cliente_id() -> None:
    with pytest.raises(ValidationError, match="cliente_nombre"):
        CotizacionCrear(items=[ItemCalculoEntrada(paneles_largo=4, paneles_ancho=3, bloques=1)])


def test_crea_la_cotizacion_y_persiste_los_items(db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    _crear_material_con_precio(db, "VAR1650", Decimal("7.20"))
    _crear_material_con_precio(db, "LOG", Decimal("35.00"))
    usuario = _crear_usuario(db)
    llamada = _mock_calc_service_ok(monkeypatch)

    cotizacion, calculo = crear_cotizacion(db, _datos_minimos(), usuario)

    assert cotizacion.id is not None
    assert cotizacion.estado == EstadoCotizacion.COTIZADA
    assert cotizacion.cliente_nombre == "Cliente de prueba"
    assert len(cotizacion.items) == 1
    assert cotizacion.items[0].paneles_largo == 4

    assert calculo.total == Decimal("107.64")

    # LOG estaba activo con precio: se manda como cargo fijo de cantidad 1.
    assert llamada["json"]["cargos_fijos"] == {"LOG": 1}
    assert llamada["json"]["iva_porcentaje"] == "15"  # IVA_PORCENTAJE por defecto de settings


def test_no_manda_cargo_fijo_de_logistica_si_no_esta_activo(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _crear_material_con_precio(db, "VAR1650", Decimal("7.20"))
    _crear_material_con_precio(db, "LOG", Decimal("35.00"), activo=False)
    usuario = _crear_usuario(db)
    llamada = _mock_calc_service_ok(monkeypatch)

    crear_cotizacion(db, _datos_minimos(), usuario)

    assert llamada["json"]["cargos_fijos"] == {}
    assert "LOG" not in llamada["json"]["precios"]


def test_lanza_si_falta_precio_vigente_de_un_material_activo(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    material = Material(codigo="VAR1650", nombre="VAR1650", activo=True)
    db.add(material)
    db.flush()
    # Sin PrecioMaterial asociado.
    usuario = _crear_usuario(db)
    _mock_calc_service_ok(monkeypatch)

    with pytest.raises(PrecioVigenteFaltante):
        crear_cotizacion(db, _datos_minimos(), usuario)


def test_cliente_id_inexistente_lanza_cliente_no_disponible(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _crear_material_con_precio(db, "VAR1650", Decimal("7.20"))
    usuario = _crear_usuario(db)
    _mock_calc_service_ok(monkeypatch)

    datos = CotizacionCrear(
        cliente_id=999999,
        cliente_nombre="Cliente de prueba",
        items=[ItemCalculoEntrada(paneles_largo=4, paneles_ancho=3, bloques=1)],
    )

    with pytest.raises(ClienteNoDisponible):
        crear_cotizacion(db, datos, usuario)


def test_cliente_id_existente_se_asocia_a_la_cotizacion(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _crear_material_con_precio(db, "VAR1650", Decimal("7.20"))
    usuario = _crear_usuario(db)
    cliente = Cliente(
        nombre="Cliente catalogado",
        tipo_identificacion=TipoIdentificacion.CEDULA,
        identificacion="1234567890",
        email="cliente@example.com",
    )
    db.add(cliente)
    db.flush()
    _mock_calc_service_ok(monkeypatch)

    # No manda cliente_nombre: con cliente_id alcanza.
    datos = CotizacionCrear(
        cliente_id=cliente.id,
        items=[ItemCalculoEntrada(paneles_largo=4, paneles_ancho=3, bloques=1)],
    )

    cotizacion, _ = crear_cotizacion(db, datos, usuario)

    assert cotizacion.cliente_id == cliente.id
    assert cotizacion.cliente_nombre == "Cliente catalogado"
    assert cotizacion.cliente_email == "cliente@example.com"


def test_snapshot_del_cliente_viene_de_la_base_y_no_del_request(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Si mandan cliente_id, lo que venga en cliente_nombre/email se ignora."""
    _crear_material_con_precio(db, "VAR1650", Decimal("7.20"))
    usuario = _crear_usuario(db)
    cliente = Cliente(
        nombre="Nombre real en el catálogo",
        tipo_identificacion=TipoIdentificacion.CEDULA,
        identificacion="1234567890",
        email="real@example.com",
    )
    db.add(cliente)
    db.flush()
    _mock_calc_service_ok(monkeypatch)

    datos = CotizacionCrear(
        cliente_id=cliente.id,
        cliente_nombre="Nombre inventado por quien llena el formulario",
        cliente_email="otro@example.com",
        items=[ItemCalculoEntrada(paneles_largo=4, paneles_ancho=3, bloques=1)],
    )

    cotizacion, _ = crear_cotizacion(db, datos, usuario)

    assert cotizacion.cliente_nombre == "Nombre real en el catálogo"
    assert cotizacion.cliente_email == "real@example.com"


def test_cliente_dado_de_baja_lanza_cliente_no_disponible(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _crear_material_con_precio(db, "VAR1650", Decimal("7.20"))
    usuario = _crear_usuario(db)
    cliente = Cliente(
        nombre="Cliente de baja",
        tipo_identificacion=TipoIdentificacion.CEDULA,
        identificacion="1234567890",
        activo=False,
    )
    db.add(cliente)
    db.flush()
    _mock_calc_service_ok(monkeypatch)

    datos = CotizacionCrear(
        cliente_id=cliente.id,
        items=[ItemCalculoEntrada(paneles_largo=4, paneles_ancho=3, bloques=1)],
    )

    with pytest.raises(ClienteNoDisponible):
        crear_cotizacion(db, datos, usuario)


def test_proyecto_id_inexistente_lanza_proyecto_no_disponible(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _crear_material_con_precio(db, "VAR1650", Decimal("7.20"))
    usuario = _crear_usuario(db)
    _mock_calc_service_ok(monkeypatch)

    datos = CotizacionCrear(
        proyecto_id=999999,
        cliente_nombre="Cliente de prueba",
        items=[ItemCalculoEntrada(paneles_largo=4, paneles_ancho=3, bloques=1)],
    )

    with pytest.raises(ProyectoNoDisponible):
        crear_cotizacion(db, datos, usuario)


def test_proyecto_id_existente_se_asocia_a_la_cotizacion(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _crear_material_con_precio(db, "VAR1650", Decimal("7.20"))
    usuario = _crear_usuario(db)
    cliente = Cliente(
        nombre="Cliente del proyecto",
        tipo_identificacion=TipoIdentificacion.CEDULA,
        identificacion="1234567890",
    )
    db.add(cliente)
    db.flush()
    proyecto = Proyecto(nombre="Proyecto de prueba", cliente_id=cliente.id, usuario_id=usuario.id)
    db.add(proyecto)
    db.flush()
    _mock_calc_service_ok(monkeypatch)

    datos = CotizacionCrear(
        proyecto_id=proyecto.id,
        cliente_nombre="Cliente de prueba",
        items=[ItemCalculoEntrada(paneles_largo=4, paneles_ancho=3, bloques=1)],
    )

    cotizacion, _ = crear_cotizacion(db, datos, usuario)

    assert cotizacion.proyecto_id == proyecto.id
