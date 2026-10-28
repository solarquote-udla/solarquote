"""
Métricas de la sesión de aceptación (scripts/metricas_aceptacion.py).

De aquí salen cifras del documento (sección 7.4): se prueba que cada una
se calcula como dice el protocolo y que el script solo lee lo del período
pedido.
"""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.models.boceto import Boceto
from app.models.cliente import Cliente, TipoIdentificacion
from app.models.cotizacion import Cotizacion
from app.models.material import Material
from app.models.proyecto import Proyecto
from app.models.validacion import Despacho, ItemDespacho, ItemRecepcion, Recepcion
from scripts.metricas_aceptacion import Datos, FilaBoceto, FilaConteo, calcular, informe, recolectar
from tests.fabricas import crear_usuario

SESION = datetime(2026, 12, 8, 15, 0, tzinfo=timezone.utc)


# ─── calcular (sin base) ──────────────────────────────────────────────


def _datos(**campos) -> Datos:
    base = dict(
        bocetos=[], minutos_por_cotizacion=[], conteos=[], despachos=0,
        despachos_con_justificacion=0, recepciones=0, recepciones_con_diferencias=0,
    )
    return Datos(**{**base, **campos})


def test_bocetos_sin_correcciones_solo_entre_los_confirmados():
    m = calcular(_datos(bocetos=[
        FilaBoceto("ia", 0, True), FilaBoceto("ia", 3, True), FilaBoceto("dxf", 0, True), FilaBoceto("ia", 5, False),
    ]))
    assert (m["bocetos_cargados"], m["bocetos_confirmados"], m["bocetos_ia_confirmados"]) == (4, 3, 2)
    assert m["bocetos_sin_correcciones"] == pytest.approx(2 / 3)
    assert m["correcciones_medias"] == pytest.approx(1)


def test_tiempo_por_cotizacion_frente_a_los_45_minutos():
    m = calcular(_datos(minutos_por_cotizacion=[10, 12, 30]))
    assert m["minutos_mediana"] == 12
    assert m["minutos_maximo"] == 30
    assert m["ahorro_frente_a_linea_base"] == pytest.approx(1 - 12 / 45)


def test_conteo_aceptado_sin_cambio_y_diferencia_media():
    m = calcular(_datos(conteos=[FilaConteo(352, 352), FilaConteo(370, 374), FilaConteo(100, 90)]))
    assert m["conteos_aceptados_sin_cambio"] == pytest.approx(1 / 3)
    assert m["conteo_error_medio"] == pytest.approx((0 + 4 + 10) / 3)


def test_sin_datos_no_divide_por_cero_y_lo_dice():
    m = calcular(_datos())
    assert m["bocetos_sin_correcciones"] is None and m["minutos_mediana"] is None
    texto = informe(m)
    assert "sin datos" in texto
    assert "45 min" in texto


# ─── recolectar (con base) ────────────────────────────────────────────


def _escenario(db: Session, cuando: datetime, sufijo: str) -> None:
    """Un boceto con IA corregido 2 veces, cotizado a los 18 min, despachado con conteo y recibido con diferencia."""
    usuario = crear_usuario(db)
    cliente = Cliente(nombre=f"Cliente {sufijo}", tipo_identificacion=TipoIdentificacion.PASAPORTE, identificacion=f"PAS{sufijo}")
    db.add(cliente)
    db.flush()
    proyecto = Proyecto(nombre=f"Proyecto {sufijo}", cliente_id=cliente.id, usuario_id=usuario.id, created_at=cuando)
    db.add(proyecto)
    db.flush()
    db.add(Boceto(
        proyecto_id=proyecto.id, usuario_id=usuario.id, nombre_archivo="b.pdf", formato="pdf", tamano_bytes=3,
        contenido=b"pdf", metodo="ia", advertencias=[], ediciones_manuales=2, created_at=cuando + timedelta(minutes=1),
    ))
    material = Material(codigo=f"VAR{sufijo}", nombre="Varilla", unidad="u")
    db.add(material)
    db.flush()
    cotizacion = Cotizacion(
        numero_proforma=f"CT-{sufijo}-2026", usuario_id=usuario.id, cliente_nombre=cliente.nombre,
        proyecto_id=proyecto.id, total=Decimal("1.00"), created_at=cuando + timedelta(minutes=18),
    )
    db.add(cotizacion)
    db.flush()
    despacho = Despacho(
        cotizacion_id=cotizacion.id, usuario_id=usuario.id, fabricado_por="A", soldado_por="B", contado_por="C",
        despachado_por="D", destino="Cayambe", justificacion="Faltaron 4", created_at=cuando + timedelta(days=1),
    )
    db.add(despacho)
    db.flush()
    db.add(ItemDespacho(
        despacho_id=despacho.id, material_id=material.id, codigo=material.codigo, nombre="Varilla",
        cantidad_cotizada=374, cantidad_despachada=370, conteo_ia=366,
    ))
    recepcion = Recepcion(cotizacion_id=cotizacion.id, usuario_id=usuario.id, recibido_por="E", created_at=cuando + timedelta(days=2))
    db.add(recepcion)
    db.flush()
    db.add(ItemRecepcion(
        recepcion_id=recepcion.id, material_id=material.id, codigo=material.codigo, nombre="Varilla",
        cantidad_esperada=370, cantidad_recibida=368, estado="diferencia", observacion="Dos dobladas",
    ))
    db.flush()


def test_recolecta_lo_de_la_sesion(db: Session):
    _escenario(db, SESION, "901")

    m = calcular(recolectar(db, date(2026, 12, 7), date(2026, 12, 11)))

    assert (m["bocetos_cargados"], m["bocetos_confirmados"], m["bocetos_ia_confirmados"]) == (1, 1, 1)
    assert m["correcciones_medias"] == 2
    assert m["minutos_mediana"] == pytest.approx(18)
    assert m["conteos"] == 1 and m["conteo_error_medio"] == 4
    assert (m["despachos"], m["despachos_con_justificacion"]) == (1, 1)
    assert (m["recepciones"], m["recepciones_con_diferencias"]) == (1, 1)


def test_deja_fuera_lo_que_no_es_del_periodo(db: Session):
    _escenario(db, SESION, "902")
    _escenario(db, SESION - timedelta(days=30), "903")

    m = calcular(recolectar(db, date(2026, 12, 7), date(2026, 12, 11)))

    assert m["bocetos_cargados"] == 1
    assert m["cotizaciones"] == 1
    assert m["despachos"] == 1
