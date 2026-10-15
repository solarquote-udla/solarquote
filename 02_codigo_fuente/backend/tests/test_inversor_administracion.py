"""Pruebas del catálogo de inversores (RF-08)."""

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.models.inversor import Inversor
from app.schemas.inversor import InversorActualizar, InversorCrear
from app.services.inversor import (
    InversorDuplicado,
    actualizar_inversor,
    crear_inversor,
    listar_inversores,
    obtener_inversor,
)


def _crear_inversor(db: Session, marca: str, modelo: str, *, activo: bool = True) -> Inversor:
    inversor = Inversor(marca=marca, modelo=modelo, potencia_kw=50.0, activo=activo)
    db.add(inversor)
    db.flush()
    return inversor


def test_crear_inversor_lo_agrega_al_catalogo(db: Session) -> None:
    inversor = crear_inversor(
        db,
        marca="Huawei",
        modelo="SUN2000-50KTL",
        potencia_kw=50.0,
        vmax_v=1100.0,
        vmin_v=200.0,
        mppts=6,
        strings_por_mppt=2,
    )

    assert inversor.id is not None
    assert inversor.activo is True
    assert obtener_inversor(db, inversor.id) is not None


def test_crear_inversor_con_marca_y_modelo_duplicados_falla(db: Session) -> None:
    crear_inversor(db, marca="Huawei", modelo="SUN2000-50KTL", potencia_kw=50.0, vmax_v=None, vmin_v=None, mppts=None, strings_por_mppt=None)

    with pytest.raises(InversorDuplicado):
        crear_inversor(db, marca="Huawei", modelo="SUN2000-50KTL", potencia_kw=60.0, vmax_v=None, vmin_v=None, mppts=None, strings_por_mppt=None)


def test_listar_excluye_inactivos_por_defecto(db: Session) -> None:
    _crear_inversor(db, "Huawei", "Viejo", activo=False)

    assert listar_inversores(db) == []
    assert len(listar_inversores(db, incluir_inactivos=True)) == 1


def test_listar_ordena_por_marca_y_modelo(db: Session) -> None:
    _crear_inversor(db, "Sungrow", "SG50")
    _crear_inversor(db, "Huawei", "SUN2000")

    nombres = [(i.marca, i.modelo) for i in listar_inversores(db)]
    assert nombres == [("Huawei", "SUN2000"), ("Sungrow", "SG50")]


def test_actualizar_inversor_cambia_los_campos_enviados(db: Session) -> None:
    inversor = _crear_inversor(db, "Huawei", "SUN2000-50KTL")

    actualizado = actualizar_inversor(db, inversor.id, marca="Huawei Solar", potencia_kw=55.0)

    assert actualizado is not None
    assert actualizado.marca == "Huawei Solar"
    assert actualizado.potencia_kw == 55.0
    assert actualizado.modelo == "SUN2000-50KTL"  # no se tocó


def test_actualizar_inversor_puede_borrar_un_campo_opcional(db: Session) -> None:
    inversor = crear_inversor(
        db, marca="Huawei", modelo="SUN2000-50KTL", potencia_kw=50.0, vmax_v=1100.0, vmin_v=200.0, mppts=6, strings_por_mppt=2
    )

    # Pasar None explícito borra el valor; omitir el argumento (Ellipsis) lo deja igual.
    actualizado = actualizar_inversor(db, inversor.id, vmax_v=None)

    assert actualizado is not None
    assert actualizado.vmax_v is None
    assert actualizado.vmin_v == 200.0  # no se envió, sigue igual


def test_actualizar_inversor_sin_argumentos_no_cambia_nada(db: Session) -> None:
    inversor = crear_inversor(
        db, marca="Huawei", modelo="SUN2000-50KTL", potencia_kw=50.0, vmax_v=1100.0, vmin_v=200.0, mppts=6, strings_por_mppt=2
    )

    actualizado = actualizar_inversor(db, inversor.id)

    assert actualizado is not None
    assert actualizado.vmax_v == 1100.0
    assert actualizado.vmin_v == 200.0
    assert actualizado.mppts == 6


def test_actualizar_inversor_inexistente_devuelve_none(db: Session) -> None:
    assert actualizar_inversor(db, 999999, marca="X") is None


def test_actualizar_inversor_a_marca_modelo_duplicados_falla(db: Session) -> None:
    _crear_inversor(db, "Huawei", "SUN2000-50KTL")
    otro = _crear_inversor(db, "Sungrow", "SG50")

    with pytest.raises(InversorDuplicado):
        actualizar_inversor(db, otro.id, marca="Huawei", modelo="SUN2000-50KTL")


class TestInversorCrearSchema:
    def test_acepta_datos_validos(self) -> None:
        datos = InversorCrear(marca="Huawei", modelo="SUN2000-50KTL", potencia_kw=50.0)
        assert datos.marca == "Huawei"
        assert datos.vmax_v is None

    def test_colapsa_espacios_de_marca_y_modelo(self) -> None:
        datos = InversorCrear(marca="  Huawei   Solar  ", modelo="SUN2000", potencia_kw=50.0)
        assert datos.marca == "Huawei Solar"

    def test_rechaza_marca_en_blanco(self) -> None:
        with pytest.raises(ValidationError):
            InversorCrear(marca="  ", modelo="SUN2000", potencia_kw=50.0)

    def test_rechaza_potencia_cero_o_negativa(self) -> None:
        with pytest.raises(ValidationError):
            InversorCrear(marca="Huawei", modelo="SUN2000", potencia_kw=0)

    def test_rechaza_mppts_negativo(self) -> None:
        with pytest.raises(ValidationError):
            InversorCrear(marca="Huawei", modelo="SUN2000", potencia_kw=50.0, mppts=-1)


class TestInversorActualizarSchema:
    def test_todos_los_campos_son_opcionales(self) -> None:
        datos = InversorActualizar()
        assert datos.model_fields_set == set()

    def test_model_fields_set_distingue_enviado_de_omitido(self) -> None:
        datos = InversorActualizar(vmax_v=None)
        assert "vmax_v" in datos.model_fields_set
        assert "vmin_v" not in datos.model_fields_set
