"""Pruebas de la administración de precios de materiales (RF-09)."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.models.material import Material, PrecioMaterial
from app.schemas.material import MaterialActualizar, MaterialCrear, PrecioActualizar
from app.services.material import (
    CodigoDuplicado,
    MaterialEnUso,
    actualizar_material,
    actualizar_precio,
    crear_material,
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


def test_crear_material_lo_agrega_al_catalogo(db: Session) -> None:
    material = crear_material(db, "HEX_V18MM", "Varilla hexagonal 18mm", "m")

    assert material.codigo == "HEX_V18MM"
    assert material.activo is True
    assert obtener_material(db, material.id) is not None


def test_crear_material_con_codigo_duplicado_falla(db: Session) -> None:
    crear_material(db, "VAR1650", "Varilla 1650", "m")

    with pytest.raises(CodigoDuplicado):
        crear_material(db, "VAR1650", "Otra varilla", "m")


def test_actualizar_material_cambia_nombre_unidad_y_activo(db: Session) -> None:
    material = _crear_material(db, "GRAPA_X")

    resultado = actualizar_material(db, material.id, nombre="Grapa X", unidad="m", activo=False)

    assert resultado is not None
    actualizado, _ = resultado
    assert actualizado.nombre == "Grapa X"
    assert actualizado.unidad == "m"
    assert actualizado.activo is False
    assert actualizado.codigo == "GRAPA_X"  # el código no cambia


def test_actualizar_material_parcial_no_toca_los_campos_omitidos(db: Session) -> None:
    material = _crear_material(db, "GRAPA_X")
    material.nombre = "Nombre original"
    material.unidad = "kg"
    db.flush()

    resultado = actualizar_material(db, material.id, activo=False)

    assert resultado is not None
    actualizado, _ = resultado
    assert actualizado.nombre == "Nombre original"
    assert actualizado.unidad == "kg"
    assert actualizado.activo is False


def test_actualizar_material_inexistente_devuelve_none(db: Session) -> None:
    assert actualizar_material(db, 999999, nombre="X") is None


def test_desactivar_un_codigo_de_formula_lanza_material_en_uso(db: Session) -> None:
    """Revisión del PR #35 (Joseph): desactivar VAR1650 rompía todas las cotizaciones."""
    material = _crear_material(db, "VAR1650")

    with pytest.raises(MaterialEnUso):
        actualizar_material(db, material.id, activo=False)


def test_desactivar_un_codigo_de_formula_no_cambia_nada(db: Session) -> None:
    """El intento no debe dejar a medias otros campos que vinieran en el mismo PATCH."""
    material = _crear_material(db, "VAR1650")

    with pytest.raises(MaterialEnUso):
        actualizar_material(db, material.id, nombre="Otro nombre", activo=False)

    assert material.nombre == "VAR1650"


class TestMaterialCrearSchema:
    def test_normaliza_el_codigo_a_mayusculas(self) -> None:
        assert MaterialCrear(codigo="var1650", nombre="Varilla", unidad="m").codigo == "VAR1650"

    def test_rechaza_codigo_con_caracteres_invalidos(self) -> None:
        with pytest.raises(ValidationError):
            MaterialCrear(codigo="var-1650!", nombre="Varilla", unidad="m")

    def test_colapsa_espacios_del_nombre(self) -> None:
        creado = MaterialCrear(codigo="VAR1650", nombre="  Varilla   1650  ", unidad="m")
        assert creado.nombre == "Varilla 1650"

    def test_rechaza_nombre_en_blanco(self) -> None:
        with pytest.raises(ValidationError):
            MaterialCrear(codigo="VAR1650", nombre="   ", unidad="m")

    def test_usa_unidad_por_defecto(self) -> None:
        assert MaterialCrear(codigo="VAR1650", nombre="Varilla").unidad == "unidad"


class TestMaterialActualizarSchema:
    def test_todos_los_campos_son_opcionales(self) -> None:
        datos = MaterialActualizar()
        assert datos.nombre is None
        assert datos.unidad is None
        assert datos.activo is None

    def test_rechaza_nombre_en_blanco_si_se_envia(self) -> None:
        with pytest.raises(ValidationError):
            MaterialActualizar(nombre="  ")


class TestPrecioActualizarSchema:
    def test_acepta_un_precio_positivo(self) -> None:
        assert PrecioActualizar(precio=Decimal("8.50")).precio == Decimal("8.50")

    def test_acepta_cero(self) -> None:
        """RF-09: el precio puede ser cero (por ejemplo, la logística sin cargo)."""
        assert PrecioActualizar(precio=Decimal("0")).precio == Decimal("0")

    def test_rechaza_negativo(self) -> None:
        with pytest.raises(ValidationError):
            PrecioActualizar(precio=Decimal("-1.00"))

    def test_rechaza_mas_de_dos_decimales(self) -> None:
        with pytest.raises(ValidationError):
            PrecioActualizar(precio=Decimal("8.555"))
