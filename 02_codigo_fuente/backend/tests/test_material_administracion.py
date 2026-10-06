"""Pruebas de la administración de precios de materiales (RF-09)."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.material import Material, PrecioMaterial
from app.services.material import (
    actualizar_precio,
    listar_materiales,
    obtener_historial_precios,
    obtener_material,
)

AYER = datetime.now(timezone.utc) - timedelta(days=1)


def _crear_material(db: Session, codigo: str, *, activo: bool = True, precio: Decimal | None = None) -> Material:
    material = Material(codigo=codigo, nombre=codigo, activo=activo)
    db.add(material)
    db.flush()
    if precio is not None:
        db.add(PrecioMaterial(material_id=material.id, precio=precio, vigente_desde=AYER, vigente_hasta=None))
        db.flush()
    return material


def test_listar_incluye_el_precio_vigente(db: Session) -> None:
    _crear_material(db, "VAR1650", precio=Decimal("7.20"))
    _crear_material(db, "LOG", precio=Decimal("35.00"))

    filas = {material.codigo: precio for material, precio in listar_materiales(db)}

    assert filas["VAR1650"].precio == Decimal("7.20")
    assert filas["LOG"].precio == Decimal("35.00")


def test_listar_devuelve_none_si_no_tiene_precio_todavia(db: Session) -> None:
    _crear_material(db, "NUEVO")

    filas = dict(listar_materiales(db))
    (precio,) = filas.values()

    assert precio is None


def test_listar_excluye_inactivos_por_defecto(db: Session) -> None:
    _crear_material(db, "VIEJO", activo=False, precio=Decimal("1.00"))

    assert listar_materiales(db) == []
    assert len(listar_materiales(db, incluir_inactivos=True)) == 1


def test_actualizar_precio_cierra_el_anterior_y_crea_uno_nuevo(db: Session) -> None:
    material = _crear_material(db, "VAR1650", precio=Decimal("7.20"))

    resultado = actualizar_precio(db, material.id, Decimal("8.50"))
    assert resultado is not None
    _, nuevo = resultado

    assert nuevo.precio == Decimal("8.50")
    assert nuevo.vigente_hasta is None

    historial = obtener_historial_precios(db, material.id)
    assert len(historial) == 2
    anterior = next(p for p in historial if p.precio == Decimal("7.20"))
    assert anterior.vigente_hasta is not None


def test_actualizar_precio_sin_precio_previo_no_falla(db: Session) -> None:
    material = _crear_material(db, "NUEVO")

    resultado = actualizar_precio(db, material.id, Decimal("10.00"))

    assert resultado is not None
    _, nuevo = resultado
    assert nuevo.precio == Decimal("10.00")
    assert len(obtener_historial_precios(db, material.id)) == 1


def test_actualizar_precio_material_inexistente_devuelve_none(db: Session) -> None:
    assert actualizar_precio(db, 999999, Decimal("1.00")) is None


def test_obtener_historial_material_inexistente_devuelve_none(db: Session) -> None:
    assert obtener_historial_precios(db, 999999) is None


def test_obtener_material_incluye_precio_vigente(db: Session) -> None:
    material = _crear_material(db, "VAR1650", precio=Decimal("7.20"))

    resultado = obtener_material(db, material.id)

    assert resultado is not None
    _, precio = resultado
    assert precio.precio == Decimal("7.20")


def test_historial_queda_ordenado_del_mas_reciente_al_mas_antiguo(db: Session) -> None:
    material = _crear_material(db, "VAR1650", precio=Decimal("7.20"))
    actualizar_precio(db, material.id, Decimal("8.50"))
    actualizar_precio(db, material.id, Decimal("9.00"))

    historial = obtener_historial_precios(db, material.id)

    assert [p.precio for p in historial] == [Decimal("9.00"), Decimal("8.50"), Decimal("7.20")]
