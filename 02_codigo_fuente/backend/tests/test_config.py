"""Pruebas de validación de la configuración (app/core/config.py)."""

from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_iva_porcentaje_tiene_un_valor_por_defecto() -> None:
    config = Settings(DATABASE_URL="postgresql://x/x", SECRET_KEY="x")
    assert config.IVA_PORCENTAJE == Decimal("15")


def test_iva_porcentaje_se_puede_configurar() -> None:
    config = Settings(DATABASE_URL="postgresql://x/x", SECRET_KEY="x", IVA_PORCENTAJE="12")
    assert config.IVA_PORCENTAJE == Decimal("12")


@pytest.mark.parametrize("valor", ["-1", "100.01", "500"])
def test_iva_porcentaje_fuera_de_rango_tumba_el_arranque(valor: str) -> None:
    with pytest.raises(ValidationError, match="IVA_PORCENTAJE"):
        Settings(DATABASE_URL="postgresql://x/x", SECRET_KEY="x", IVA_PORCENTAJE=valor)
