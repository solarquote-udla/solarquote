"""Pruebas de la resolución de precios vigentes (RF-06)."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.models.material import Material, PrecioMaterial
from app.services.material import PrecioVigenteFaltante, obtener_precios_vigentes

AYER = datetime.now(timezone.utc) - timedelta(days=1)
HACE_UN_ANIO = datetime.now(timezone.utc) - timedelta(days=365)


def _crear_material(db: Session, codigo: str, *precios: tuple[Decimal, datetime, datetime | None]) -> None:
    material = Material(codigo=codigo, nombre=codigo)
    db.add(material)
    db.flush()
    for precio, vigente_desde, vigente_hasta in precios:
        db.add(
            PrecioMaterial(
                material_id=material.id,
                precio=precio,
                vigente_desde=vigente_desde,
                vigente_hasta=vigente_hasta,
            )
        )
    db.flush()


def test_devuelve_el_precio_vigente_de_cada_codigo(db: Session) -> None:
    _crear_material(db, "VAR1650", (Decimal("7.20"), AYER, None))
    _crear_material(db, "LOG", (Decimal("35.00"), AYER, None))

    precios = obtener_precios_vigentes(db, ["VAR1650", "LOG"])

    assert precios == {"VAR1650": Decimal("7.20"), "LOG": Decimal("35.00")}


def test_ignora_precios_que_ya_no_estan_vigentes(db: Session) -> None:
    _crear_material(
        db,
        "VAR1650",
        (Decimal("6.00"), HACE_UN_ANIO, AYER),  # precio histórico, ya cerrado
        (Decimal("7.20"), AYER, None),  # precio vigente
    )

    precios = obtener_precios_vigentes(db, ["VAR1650"])

    assert precios == {"VAR1650": Decimal("7.20")}


def test_lanza_si_falta_el_precio_vigente_de_un_codigo(db: Session) -> None:
    _crear_material(db, "VAR1650", (Decimal("7.20"), AYER, None))

    with pytest.raises(PrecioVigenteFaltante) as exc:
        obtener_precios_vigentes(db, ["VAR1650", "LOG"])

    assert exc.value.codigos == ["LOG"]


def test_lanza_si_el_codigo_no_existe_como_material(db: Session) -> None:
    with pytest.raises(PrecioVigenteFaltante) as exc:
        obtener_precios_vigentes(db, ["NO_EXISTE"])

    assert exc.value.codigos == ["NO_EXISTE"]
