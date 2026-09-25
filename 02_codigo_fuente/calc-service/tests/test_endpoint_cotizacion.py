from decimal import Decimal

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

PRECIOS = {
    "VAR1650": "7.20",
    "VAR1350": "6.20",
    "HEX_V18MM": "2.40",
    "SOP_A": "4.75",
    "SOP_V": "4.75",
    "SOP_V_E": "3.25",
    "ANT_B": "2.10",
    "ANT_VAR": "3.20",
    "CLAMP_F": "1.00",
    "CLAMP_I": "1.00",
}


def test_calcula_total_de_un_item_sin_addendum():
    respuesta = client.post(
        "/api/cotizacion/calcular",
        json={
            "items": [{"paneles_largo": 4, "paneles_ancho": 3, "bloques": 1}],
            "precios": PRECIOS,
            "addendum_porcentaje": "0",
        },
    )

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()

    cantidades = cuerpo["cantidades_totales"]
    assert cantidades == {
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

    subtotal_esperado = sum(Decimal(PRECIOS[c]) * q for c, q in cantidades.items())
    assert Decimal(cuerpo["subtotal"]) == subtotal_esperado.quantize(Decimal("0.01"))

    # Sin addendum, el IVA (15%) se aplica directo sobre el subtotal.
    iva_esperado = (subtotal_esperado * Decimal("15") / Decimal("100")).quantize(Decimal("0.01"))
    assert Decimal(cuerpo["iva_monto"]) == iva_esperado
    assert Decimal(cuerpo["total"]) == (subtotal_esperado + iva_esperado).quantize(Decimal("0.01"))


def test_suma_cantidades_de_varios_items():
    respuesta = client.post(
        "/api/cotizacion/calcular",
        json={
            "items": [
                {"paneles_largo": 4, "paneles_ancho": 3, "bloques": 1},
                {"paneles_largo": 4, "paneles_ancho": 3, "bloques": 1},
            ],
            "precios": PRECIOS,
            "addendum_porcentaje": "0",
        },
    )

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert len(cuerpo["items"]) == 2
    assert cuerpo["cantidades_totales"]["VAR1650"] == 16  # 8 + 8


def test_aplica_addendum_antes_del_iva():
    respuesta = client.post(
        "/api/cotizacion/calcular",
        json={
            "items": [{"paneles_largo": 2, "paneles_ancho": 1, "bloques": 1}],
            "precios": PRECIOS,
            "addendum_porcentaje": "10",
        },
    )

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()

    subtotal = Decimal(cuerpo["subtotal"])
    addendum_monto = Decimal(cuerpo["addendum_monto"])
    iva_monto = Decimal(cuerpo["iva_monto"])
    total = Decimal(cuerpo["total"])

    assert addendum_monto == (subtotal * Decimal("10") / Decimal("100")).quantize(Decimal("0.01"))
    base_con_addendum = subtotal + addendum_monto
    assert iva_monto == (base_con_addendum * Decimal("15") / Decimal("100")).quantize(Decimal("0.01"))
    assert total == (base_con_addendum + iva_monto).quantize(Decimal("0.01"))


def test_rechaza_l_impar():
    respuesta = client.post(
        "/api/cotizacion/calcular",
        json={
            "items": [{"paneles_largo": 3, "paneles_ancho": 2, "bloques": 1}],
            "precios": PRECIOS,
        },
    )

    assert respuesta.status_code == 422


def test_rechaza_lista_de_items_vacia():
    respuesta = client.post(
        "/api/cotizacion/calcular",
        json={"items": [], "precios": PRECIOS},
    )

    assert respuesta.status_code == 422


def test_rechaza_precios_incompletos():
    respuesta = client.post(
        "/api/cotizacion/calcular",
        json={
            "items": [{"paneles_largo": 4, "paneles_ancho": 3, "bloques": 1}],
            "precios": {"VAR1650": "7.20"},
        },
    )

    assert respuesta.status_code == 422
    assert "VAR1350" in respuesta.json()["detail"]
