"""Pruebas de validación de cédula, RUC y teléfono (RF-12)."""

import pytest

from app.services.validaciones_identificacion import validar_cedula, validar_ruc, validar_telefono


class TestCedula:
    def test_cedula_valida(self) -> None:
        assert validar_cedula("1710034065") is True  # ejemplo de CONTRATO-CLIENTES.md

    def test_acepta_con_espacios_y_guiones(self) -> None:
        assert validar_cedula("17 10034065") is True
        assert validar_cedula("171-0034065") is True

    def test_rechaza_largo_incorrecto(self) -> None:
        assert validar_cedula("171003406") is False
        assert validar_cedula("17100340655") is False

    def test_rechaza_no_numerico(self) -> None:
        assert validar_cedula("17100340ab") is False

    def test_rechaza_provincia_invalida(self) -> None:
        assert validar_cedula("9910034065") is False  # provincia 99

    def test_rechaza_tercer_digito_mayor_o_igual_a_6(self) -> None:
        assert validar_cedula("1760034065") is False

    def test_rechaza_digito_verificador_incorrecto(self) -> None:
        assert validar_cedula("1710034066") is False


class TestRuc:
    def test_ruc_persona_natural_valido(self) -> None:
        assert validar_ruc("1710034065001") is True

    def test_ruc_persona_natural_invalido_si_la_cedula_base_no_es_valida(self) -> None:
        assert validar_ruc("1710034066001") is False

    def test_ruc_sector_publico(self) -> None:
        assert validar_ruc("1760001230001") is True

    def test_ruc_sociedad_privada(self) -> None:
        assert validar_ruc("1790012345001") is True

    def test_rechaza_tercer_digito_invalido(self) -> None:
        assert validar_ruc("1770012345001") is False  # 7 no es un tercer dígito válido

    def test_rechaza_establecimiento_000(self) -> None:
        assert validar_ruc("1790012345000") is False

    def test_rechaza_largo_incorrecto(self) -> None:
        assert validar_ruc("179001234500") is False


class TestTelefono:
    @pytest.mark.parametrize(
        "valor",
        ["0991234567", "062 123 456", "+593 99 123 4567", "(02) 123-4567"],
    )
    def test_formatos_validos(self, valor: str) -> None:
        assert validar_telefono(valor) is True

    def test_rechaza_muy_corto(self) -> None:
        assert validar_telefono("12345") is False

    def test_rechaza_muy_largo(self) -> None:
        assert validar_telefono("1" * 16) is False

    def test_rechaza_letras(self) -> None:
        assert validar_telefono("099abc4567") is False
