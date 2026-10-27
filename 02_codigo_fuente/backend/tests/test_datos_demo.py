"""Pruebas del script de siembra de datos de demostración (scripts/datos_demo.py).

Solo prueban lo que es propio del script: que cada paso es idempotente
(correrlo dos veces no duplica nada ni pisa un precio ya vigente). La
creación de proyecto/terreno/equipo ya la cubren las pruebas de sus
propios servicios.
"""

from decimal import Decimal

from sqlalchemy.orm import Session

from scripts import datos_demo
from tests.fabricas import crear_usuario

from app.models.cliente import Cliente
from app.models.inversor import Inversor
from app.models.material import Material
from app.models.proyecto import Proyecto
from app.services.equipo import obtener_configuracion
from app.services.terreno import obtener_terreno


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


def test_materiales_demo_crea_cada_material_con_su_precio(db: Session) -> None:
    datos_demo._materiales_demo(db)

    for codigo, _nombre, precio in datos_demo.MATERIALES_DEMO:
        material = db.query(Material).filter(Material.codigo == codigo).one()
        precio_vigente = next(p for p in material.precios if p.vigente_hasta is None)
        assert precio_vigente.precio == precio


def test_materiales_demo_no_duplica_el_material_ni_le_cambia_el_precio(db: Session) -> None:
    datos_demo._materiales_demo(db)
    material = db.query(Material).filter(Material.codigo == "VAR1650").one()
    precio_original = next(p for p in material.precios if p.vigente_hasta is None)

    datos_demo._materiales_demo(db)

    assert db.query(Material).filter(Material.codigo == "VAR1650").count() == 1
    db.refresh(material)
    precios_vigentes = [p for p in material.precios if p.vigente_hasta is None]
    assert len(precios_vigentes) == 1
    assert precios_vigentes[0].id == precio_original.id


def test_materiales_demo_no_toca_un_material_con_precio_vigente_ya_distinto(db: Session) -> None:
    from app.services.material import actualizar_precio, crear_material

    material = crear_material(db, codigo="VAR1650", nombre="Varilla 1650", unidad="unidad")
    actualizar_precio(db, material.id, Decimal("99.99"))

    datos_demo._materiales_demo(db)

    db.refresh(material)
    precio_vigente = next(p for p in material.precios if p.vigente_hasta is None)
    assert precio_vigente.precio == Decimal("99.99")


def test_proyecto_terreno_y_equipo_demo_son_idempotentes(db: Session) -> None:
    gerente = crear_usuario(db)
    db.commit()
    cliente = datos_demo._cliente_demo(db)

    proyecto = datos_demo._proyecto_demo(db, cliente, gerente)
    datos_demo._terreno_demo(db, proyecto)
    datos_demo._equipo_demo(db, proyecto)

    assert obtener_terreno(db, proyecto.id) is not None
    assert obtener_configuracion(db, proyecto.id) is not None

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
