"""
Catálogo de paneles e inversores que indicó Producción (migración
e7b2a9c41d06): cada dato pasa las mismas validaciones que la API, y solo
quedan activas las marcas y potencias que se usan en planta sobre suelo.
"""

import importlib.util
from pathlib import Path

import pytest

from app.schemas.inversor import InversorCrear
from app.schemas.panel_catalogo import PanelCatalogoCrear
from app.services.calculo_equipo import limites_string

_RUTA = next(Path(__file__).parents[1].glob("alembic/versions/*e7b2a9c41d06*.py"))
_spec = importlib.util.spec_from_file_location("migracion_catalogo", _RUTA)
migracion = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(migracion)

MARCAS_DE_PRODUCCION = {"LONGi", "Jinko Solar", "JA Solar", "Canadian Solar"}


@pytest.mark.parametrize("panel", migracion.PANELES_NUEVOS, ids=lambda p: p[1])
def test_cada_panel_nuevo_pasa_las_validaciones_de_la_api(panel):
    marca, modelo, potencia, largo, ancho, voc, vmp = panel
    PanelCatalogoCrear(
        marca=marca, modelo=modelo, potencia_wp=potencia, largo_mm=largo, ancho_mm=ancho, voc_v=voc, vmp_v=vmp
    )
    assert marca in MARCAS_DE_PRODUCCION
    assert potencia > 600


@pytest.mark.parametrize("inversor", migracion.INVERSORES_NUEVOS, ids=lambda i: i[1])
def test_cada_inversor_nuevo_pasa_las_validaciones_de_la_api(inversor):
    marca, modelo, potencia, vmax, vmin, mppts, strings = inversor
    InversorCrear(
        marca=marca, modelo=modelo, potencia_kw=potencia, vmax_v=vmax, vmin_v=vmin, mppts=mppts, strings_por_mppt=strings
    )
    assert marca == "Huawei"


@pytest.mark.parametrize("inversor", migracion.INVERSORES_NUEVOS, ids=lambda i: i[1])
@pytest.mark.parametrize("panel", migracion.PANELES_NUEVOS, ids=lambda p: p[1])
def test_todo_panel_nuevo_es_compatible_con_todo_inversor_nuevo(panel, inversor):
    """Con cualquier combinación se puede armar al menos un string."""
    *_, voc, vmp = panel
    _, _, _, vmax, vmin, _, _ = inversor
    limites = limites_string(vmax, vmin, voc, vmp)
    assert limites.compatible, limites.motivo


def test_los_paneles_desactivados_no_estan_entre_los_nuevos():
    nuevos = {(m, mo) for m, mo, *_ in migracion.PANELES_NUEVOS}
    assert not nuevos & set(migracion.PANELES_A_DESACTIVAR)
