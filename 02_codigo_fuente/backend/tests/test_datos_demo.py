"""Pruebas del script de siembra de datos de demostración (scripts/datos_demo.py).

Solo prueban lo que es propio del script: que cada paso es idempotente
(correrlo dos veces no duplica nada), y que la verificación de
materiales no crea un catálogo paralelo al de la migración. La
creación de proyecto/terreno/equipo ya la cubren las pruebas de sus
propios servicios.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from scripts import datos_demo
from tests.fabricas import crear_usuario

from app.models.cliente import Cliente
from app.models.inversor import Inversor
from app.models.material import Material, PrecioMaterial
from app.models.proyecto import Proyecto
from app.services.equipo import obtener_configuracion
from app.services.terreno import obtener_terreno

AYER = datetime.now(timezone.utc) - timedelta(days=1)


def _crear_material_con_precio(db: Session, codigo: str, precio: Decimal = Decimal("1.00")) -> Material:
    material = Material(codigo=codigo, nombre=codigo, unidad="unidad")
    db.add(material)
    db.flush()
    db.add(PrecioMaterial(material_id=material.id, precio=precio, vigente_desde=AYER, vigente_hasta=None))
    db.flush()
    return material


def test_gerente_activo_encuentra_al_unico_usuario_con_acceso_total(db: Session) -> None:
    assert datos_demo._gerente_activo(db) is None

    usuario = crear_usuario(db)
    db.commit()

    assert datos_demo._gerente_activo(db).id == usuario.id


def test_cliente_demo_es_idempotente(db: Session) -> None:
    creado = datos_demo._cliente_demo(db)
    assert creado.identificacion == datos_demo.IDENTIFICACION_CLIENTE

    de_nuevo = datos_demo._cliente_demo(db)
    assert de_nuevo.id == creado.id
    assert db.query(Cliente).filter(Cliente.identificacion == datos_demo.IDENTIFICACION_CLIENTE).count() == 1


def test_inversor_catalogo_demo_es_idempotente(db: Session) -> None:
    datos_demo._inversor_catalogo_demo(db)
    datos_demo._inversor_catalogo_demo(db)

    inversores = (
        db.query(Inversor)
        .filter(
            Inversor.marca == datos_demo.INVERSOR_DEMO["marca"],
            Inversor.modelo == datos_demo.INVERSOR_DEMO["modelo"],
        )
        .all()
    )
    assert len(inversores) == 1


def test_materiales_demo_ok_si_la_migracion_ya_los_puso(db: Session) -> None:
    for codigo in datos_demo.CODIGOS_MATERIAL_REQUERIDOS:
        _crear_material_con_precio(db, codigo)

    assert datos_demo._materiales_demo(db) is True
    # No crea nada: solo verifica. Un material de más indicaría que
    # terminó creando un catálogo paralelo al de la migración.
    assert db.query(Material).count() == len(datos_demo.CODIGOS_MATERIAL_REQUERIDOS)


def test_materiales_demo_falla_si_falta_alguno_en_vez_de_crearlo_con_otro_nombre(db: Session) -> None:
    faltante, *resto = datos_demo.CODIGOS_MATERIAL_REQUERIDOS
    for codigo in resto:
        _crear_material_con_precio(db, codigo)

    assert datos_demo._materiales_demo(db) is False
    assert db.query(Material).filter(Material.codigo == faltante).one_or_none() is None


def test_proyecto_terreno_y_equipo_demo_son_idempotentes(db: Session) -> None:
    gerente = crear_usuario(db)
    db.commit()
    cliente = datos_demo._cliente_demo(db)

    proyecto = datos_demo._proyecto_demo(db, cliente, gerente)
    datos_demo._terreno_demo(db, proyecto)
    datos_demo._equipo_demo(db, proyecto)

    assert obtener_terreno(db, proyecto.id) is not None
    configuracion = obtener_configuracion(db, proyecto.id)
    assert configuracion is not None
    assert len(configuracion.inversores) == datos_demo.CANTIDAD_INVERSORES_DEMO

    de_nuevo = datos_demo._proyecto_demo(db, cliente, gerente)
    datos_demo._terreno_demo(db, de_nuevo)
    datos_demo._equipo_demo(db, de_nuevo)

    assert de_nuevo.id == proyecto.id
    assert (
        db.query(Proyecto)
        .filter(Proyecto.cliente_id == cliente.id, Proyecto.nombre == datos_demo.NOMBRE_PROYECTO)
        .count()
        == 1
    )
