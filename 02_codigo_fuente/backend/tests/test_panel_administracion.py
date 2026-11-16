"""Pruebas del catálogo de paneles (RF-02)."""

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.models.panel import PanelCatalogo
from app.schemas.panel_catalogo import PanelCatalogoActualizar, PanelCatalogoCrear
from app.services.panel_catalogo import (
    PanelDuplicado,
    PanelIncoherente,
    actualizar_panel,
    buscar_paneles,
    crear_panel,
    listar_paneles,
    obtener_panel,
)

_BASE = {"potencia_wp": 580, "largo_mm": 2278, "ancho_mm": 1134, "voc_v": 52.0, "vmp_v": 43.0}


def _crear_panel(db: Session, marca: str, modelo: str, *, activo: bool = True) -> PanelCatalogo:
    panel = PanelCatalogo(marca=marca, modelo=modelo, activo=activo, **_BASE)
    db.add(panel)
    db.flush()
    return panel


def test_crear_panel_lo_agrega_al_catalogo(db: Session) -> None:
    panel = crear_panel(db, marca="Jinko Solar", modelo="JKM580N", **_BASE)

    assert panel.id is not None
    assert panel.activo is True
    assert obtener_panel(db, panel.id) is not None


def test_crear_panel_con_marca_y_modelo_duplicados_falla(db: Session) -> None:
    crear_panel(db, marca="Jinko Solar", modelo="JKM580N", **_BASE)

    with pytest.raises(PanelDuplicado):
        crear_panel(db, marca="Jinko Solar", modelo="JKM580N", **_BASE)


def test_listar_excluye_inactivos_por_defecto(db: Session) -> None:
    _crear_panel(db, "Jinko Solar", "Viejo", activo=False)

    assert listar_paneles(db) == []
    assert len(listar_paneles(db, incluir_inactivos=True)) == 1


def test_listar_ordena_por_marca_y_modelo(db: Session) -> None:
    _crear_panel(db, "Risen Energy", "RSM144")
    _crear_panel(db, "Canadian Solar", "CS6W")

    nombres = [(p.marca, p.modelo) for p in listar_paneles(db)]
    assert nombres == [("Canadian Solar", "CS6W"), ("Risen Energy", "RSM144")]


def test_listar_filtra_por_marca_modelo_y_potencia(db: Session) -> None:
    _crear_panel(db, "Jinko Solar", "JKM580N")
    _crear_panel(db, "Canadian Solar", "CS6W-580TB")

    assert [p.marca for p in listar_paneles(db, marca="jinko")] == ["Jinko Solar"]
    assert [p.modelo for p in listar_paneles(db, modelo="580tb")] == ["CS6W-580TB"]
    assert len(listar_paneles(db, potencia_wp=580)) == 2
    assert listar_paneles(db, potencia_wp=999) == []


def test_buscar_paneles_coincide_con_marca_o_modelo(db: Session) -> None:
    _crear_panel(db, "Jinko Solar", "JKM580N")
    _crear_panel(db, "Canadian Solar", "CS6W-580TB")

    assert [p.marca for p in buscar_paneles(db, "jinko")] == ["Jinko Solar"]
    assert [p.modelo for p in buscar_paneles(db, "CS6W")] == ["CS6W-580TB"]
    assert len(buscar_paneles(db, "580")) == 2
    assert buscar_paneles(db, "huawei") == []


def test_buscar_paneles_tambien_compara_con_la_potencia(db: Session) -> None:
    """
    Pedido de Lenin: buscar "580" debe encontrar un panel de 580 Wp aunque
    ni la marca ni el modelo tengan "580" como texto.
    """
    panel = PanelCatalogo(marca="Risen Energy", modelo="Hyper-ion", **_BASE)
    db.add(panel)
    db.flush()

    assert [p.modelo for p in buscar_paneles(db, "580")] == ["Hyper-ion"]
    assert buscar_paneles(db, "580.5") == []
    assert buscar_paneles(db, "abc") == []


def test_actualizar_panel_cambia_los_campos_enviados(db: Session) -> None:
    panel = _crear_panel(db, "Jinko Solar", "JKM580N")

    actualizado = actualizar_panel(db, panel.id, PanelCatalogoActualizar(marca="Jinko", potencia_wp=600))

    assert actualizado is not None
    assert actualizado.marca == "Jinko"
    assert actualizado.potencia_wp == 600
    assert actualizado.modelo == "JKM580N"  # no se tocó


def test_actualizar_panel_sin_campos_no_cambia_nada(db: Session) -> None:
    panel = _crear_panel(db, "Jinko Solar", "JKM580N")

    actualizado = actualizar_panel(db, panel.id, PanelCatalogoActualizar())

    assert actualizado is not None
    assert actualizado.voc_v == 52.0
    assert actualizado.vmp_v == 43.0


def test_actualizar_panel_inexistente_devuelve_none(db: Session) -> None:
    assert actualizar_panel(db, 999999, PanelCatalogoActualizar(marca="Jinko")) is None


def test_actualizar_panel_a_marca_modelo_duplicados_falla(db: Session) -> None:
    _crear_panel(db, "Jinko Solar", "JKM580N")
    otro = _crear_panel(db, "Canadian Solar", "CS6W")

    with pytest.raises(PanelDuplicado):
        actualizar_panel(db, otro.id, PanelCatalogoActualizar(marca="Jinko Solar", modelo="JKM580N"))


def test_actualizar_panel_que_dejaria_voc_menor_que_vmp_falla(db: Session) -> None:
    panel = crear_panel(db, marca="Jinko Solar", modelo="JKM580N", **_BASE)

    # El schema no lo bloquea (solo manda vmp_v en esta petición), pero el
    # servicio sí: el registro fusionado quedaría con voc_v <= vmp_v.
    with pytest.raises(PanelIncoherente):
        actualizar_panel(db, panel.id, PanelCatalogoActualizar(vmp_v=60.0))

    db.refresh(panel)
    assert panel.vmp_v == 43.0  # no quedó a medias


def test_actualizar_panel_que_dejaria_largo_menor_que_ancho_falla(db: Session) -> None:
    panel = _crear_panel(db, "Jinko Solar", "JKM580N")

    with pytest.raises(PanelIncoherente):
        actualizar_panel(db, panel.id, PanelCatalogoActualizar(largo_mm=1000.0))


def test_actualizar_panel_con_marca_null_explicito_falla() -> None:
    with pytest.raises(ValidationError):
        PanelCatalogoActualizar(marca=None)


def test_actualizar_panel_con_activo_null_explicito_falla() -> None:
    with pytest.raises(ValidationError):
        PanelCatalogoActualizar(activo=None)


class TestPanelCatalogoCrearSchema:
    def test_acepta_datos_validos(self) -> None:
        datos = PanelCatalogoCrear(marca="Jinko Solar", modelo="JKM580N", **_BASE)
        assert datos.marca == "Jinko Solar"

    def test_colapsa_espacios_de_marca_y_modelo(self) -> None:
        datos = PanelCatalogoCrear(marca="  Jinko   Solar  ", modelo="JKM580N", **_BASE)
        assert datos.marca == "Jinko Solar"

    def test_rechaza_marca_en_blanco(self) -> None:
        with pytest.raises(ValidationError):
            PanelCatalogoCrear(marca="  ", modelo="JKM580N", **_BASE)

    def test_rechaza_potencia_cero_o_negativa(self) -> None:
        with pytest.raises(ValidationError):
            PanelCatalogoCrear(marca="Jinko", modelo="JKM580N", **{**_BASE, "potencia_wp": 0})

    def test_rechaza_voc_menor_o_igual_que_vmp(self) -> None:
        with pytest.raises(ValidationError):
            PanelCatalogoCrear(marca="Jinko", modelo="JKM580N", **{**_BASE, "voc_v": 40.0, "vmp_v": 43.0})
        with pytest.raises(ValidationError):
            PanelCatalogoCrear(marca="Jinko", modelo="JKM580N", **{**_BASE, "voc_v": 43.0, "vmp_v": 43.0})

    def test_rechaza_largo_menor_que_ancho(self) -> None:
        with pytest.raises(ValidationError):
            PanelCatalogoCrear(marca="Jinko", modelo="JKM580N", **{**_BASE, "largo_mm": 1000.0, "ancho_mm": 1134.0})


class TestPanelCatalogoActualizarSchema:
    def test_todos_los_campos_son_opcionales(self) -> None:
        datos = PanelCatalogoActualizar()
        assert datos.model_fields_set == set()

    def test_no_valida_si_solo_envian_un_lado_de_la_regla(self) -> None:
        # Es una actualización parcial: el otro lado puede ya existir en la
        # base. Esa coherencia completa la revisa el servicio.
        datos = PanelCatalogoActualizar(vmp_v=60.0)
        assert datos.vmp_v == 60.0

    def test_valida_voc_vmp_si_envian_los_dos(self) -> None:
        with pytest.raises(ValidationError):
            PanelCatalogoActualizar(voc_v=40.0, vmp_v=43.0)

    def test_valida_largo_ancho_si_envian_los_dos(self) -> None:
        with pytest.raises(ValidationError):
            PanelCatalogoActualizar(largo_mm=1000.0, ancho_mm=1134.0)
