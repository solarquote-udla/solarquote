"""Pruebas del cliente HTTP hacia calc-service (RF-06, SQ-77 parte 2/3)."""

from decimal import Decimal

import httpx
import pytest
from pydantic import ValidationError

from app.core.config import settings
from app.schemas.cotizacion import ItemCalculoEntrada
from app.services.calc_service import CalcServiceError, calcular_via_calc_service

ITEMS = [ItemCalculoEntrada(paneles_largo=4, paneles_ancho=3, bloques=1)]
PRECIOS = {"VAR1650": Decimal("7.20"), "LOG": Decimal("35.00")}

RESPUESTA_OK = {
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


def test_arma_el_payload_y_mapea_la_respuesta(monkeypatch: pytest.MonkeyPatch) -> None:
    llamada = {}

    def _post_falso(url, *, json, headers, timeout):
        llamada["url"] = url
        llamada["json"] = json
        llamada["headers"] = headers
        llamada["timeout"] = timeout
        return httpx.Response(200, json=RESPUESTA_OK)

    monkeypatch.setattr(httpx, "post", _post_falso)

    resultado = calcular_via_calc_service(
        items=ITEMS,
        precios=PRECIOS,
        cargos_fijos={"LOG": 1},
        addendum_porcentaje=Decimal("0"),
        iva_porcentaje=Decimal("15"),
    )

    assert llamada["url"].endswith("/api/cotizacion/calcular")
    assert llamada["json"]["precios"] == {"VAR1650": "7.20", "LOG": "35.00"}
    assert llamada["json"]["cargos_fijos"] == {"LOG": 1}
    assert llamada["json"]["iva_porcentaje"] == "15"
    # DS-05: calc-service rechaza cualquier petición sin este secreto.
    assert llamada["headers"]["X-Internal-Secret"] == settings.CALC_SERVICE_SECRET

    assert resultado.total == Decimal("107.64")
    assert resultado.cantidades_totales == {"VAR1650": 8, "LOG": 1}


def test_lanza_calc_service_error_si_no_hay_conexion(monkeypatch: pytest.MonkeyPatch) -> None:
    def _post_falso(url, *, json, headers, timeout):
        raise httpx.ConnectError("conexión rechazada")

    monkeypatch.setattr(httpx, "post", _post_falso)

    with pytest.raises(CalcServiceError, match="No se pudo conectar"):
        calcular_via_calc_service(
            items=ITEMS,
            precios=PRECIOS,
            cargos_fijos={},
            addendum_porcentaje=Decimal("0"),
            iva_porcentaje=Decimal("15"),
        )


def test_lanza_calc_service_error_si_la_respuesta_no_es_200(monkeypatch: pytest.MonkeyPatch) -> None:
    def _post_falso(url, *, json, headers, timeout):
        return httpx.Response(422, json={"detail": "Faltan precios para los materiales: LOG"})

    monkeypatch.setattr(httpx, "post", _post_falso)

    with pytest.raises(CalcServiceError, match="LOG"):
        calcular_via_calc_service(
            items=ITEMS,
            precios=PRECIOS,
            cargos_fijos={"LOG": 1},
            addendum_porcentaje=Decimal("0"),
            iva_porcentaje=Decimal("15"),
        )


def test_item_calculo_entrada_rechaza_l_impar() -> None:
    with pytest.raises(ValidationError, match="número par"):
        ItemCalculoEntrada(paneles_largo=3, paneles_ancho=2, bloques=1)
