import pytest

from app.services.calculo_materiales import calcular_materiales


def test_calcula_cantidades_para_l4_a3_b1():
    resultado = calcular_materiales(L=4, A=3, B=1)

    assert resultado == {
        "VAR1650": 8,
        "VAR1350": 12,
        "HEX_V18MM": 20,
        "SOP_A": 8,
        "SOP_V": 4,
        "SOP_V_E": 8,
        "ANT_B": 16,
        "ANT_VAR": 16,
        "CLAMP_F": 16,
        "CLAMP_I": 16,
    }


def test_calcula_cantidades_para_l6_a2_b2():
    resultado = calcular_materiales(L=6, A=2, B=2)

    assert resultado == {
        "VAR1650": 18,
        "VAR1350": 24,
        "HEX_V18MM": 42,
        "SOP_A": 18,
        "SOP_V": 12,
        "SOP_V_E": 12,
        "ANT_B": 36,
        "ANT_VAR": 36,
        "CLAMP_F": 48,
        "CLAMP_I": 24,
    }


def test_a_igual_a_uno_da_clamp_i_y_sop_v_en_cero():
    resultado = calcular_materiales(L=2, A=1, B=1)

    assert resultado["CLAMP_I"] == 0
    assert resultado["SOP_V"] == 0


def test_hex_v18mm_es_la_suma_de_var1650_y_var1350():
    resultado = calcular_materiales(L=8, A=4, B=3)

    assert resultado["HEX_V18MM"] == resultado["VAR1650"] + resultado["VAR1350"]


def test_ant_var_es_igual_a_ant_b():
    resultado = calcular_materiales(L=10, A=5, B=2)

    assert resultado["ANT_VAR"] == resultado["ANT_B"]


@pytest.mark.parametrize("L", [1, 3, 5, -2])
def test_rechaza_l_impar_o_no_positivo(L):
    with pytest.raises(ValueError):
        calcular_materiales(L=L, A=2, B=1)


@pytest.mark.parametrize("A", [0, -1])
def test_rechaza_a_no_positivo(A):
    with pytest.raises(ValueError):
        calcular_materiales(L=4, A=A, B=1)


@pytest.mark.parametrize("B", [0, -1])
def test_rechaza_b_no_positivo(B):
    with pytest.raises(ValueError):
        calcular_materiales(L=4, A=2, B=B)
