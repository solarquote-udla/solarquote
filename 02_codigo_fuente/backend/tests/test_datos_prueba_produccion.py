"""Pruebas del reporte de datos de prueba en producción (scripts/datos_prueba_produccion.py).

Solo prueban el filtro: que encuentra lo que coincide con un patrón de
prueba y nada más. El script es de solo lectura — no hay nada que
probar de "no borra nada" porque no tiene ninguna sentencia de borrado.
"""

from sqlalchemy.orm import Session

from scripts import datos_prueba_produccion as reporte
from tests.fabricas import crear_usuario

from app.models.cliente import Cliente, TipoIdentificacion
from app.models.proyecto import Proyecto


def _cliente(db: Session, nombre: str, identificacion: str = "0000000000") -> Cliente:
    cliente = Cliente(
        nombre=nombre,
        tipo_identificacion=TipoIdentificacion.RUC,
        identificacion=identificacion,
        empresa=nombre,
    )
    db.add(cliente)
    db.flush()
    return cliente


def _proyecto(db: Session, cliente: Cliente, nombre: str) -> Proyecto:
    usuario = crear_usuario(db)
    proyecto = Proyecto(nombre=nombre, cliente_id=cliente.id, usuario_id=usuario.id)
    db.add(proyecto)
    db.flush()
    return proyecto


def test_clientes_de_prueba_encuentra_por_nombre_identificacion_o_empresa(db: Session) -> None:
    prueba = _cliente(db, "Cliente de PRUEBA")
    demo = _cliente(db, "SolarAndes Instalaciones", identificacion="1091234567001")
    por_identificacion = _cliente(db, "Alguien", identificacion="TEST-001")
    real = _cliente(db, "HEXtructure Cliente Real S.A.", identificacion="1790012345001")
    db.commit()

    encontrados = {c.id for c in reporte._clientes_de_prueba(db)}

    assert encontrados == {prueba.id, demo.id, por_identificacion.id}
    assert real.id not in encontrados


def test_proyectos_de_prueba_por_cliente_o_por_nombre_propio(db: Session) -> None:
    cliente_prueba = _cliente(db, "Cliente demo")
    cliente_real = _cliente(db, "HEXtructure Cliente Real S.A.", identificacion="1790012345001")
    db.commit()

    proyecto_de_cliente_prueba = _proyecto(db, cliente_prueba, "Planta normal")
    proyecto_de_prueba_en_cliente_real = _proyecto(db, cliente_real, "Proyecto de prueba, borrar")
    proyecto_real = _proyecto(db, cliente_real, "Planta fotovoltaica Cuenca")
    db.commit()

    encontrados = {p.id for p in reporte._proyectos_de_prueba(db, {cliente_prueba.id})}

    assert encontrados == {proyecto_de_cliente_prueba.id, proyecto_de_prueba_en_cliente_real.id}
    assert proyecto_real.id not in encontrados


def test_impacto_cliente_y_proyecto_cuentan_cero_sin_datos(db: Session) -> None:
    cliente = _cliente(db, "Cliente demo")
    db.commit()
    proyecto = _proyecto(db, cliente, "Proyecto demo")
    db.commit()

    assert reporte._impacto_cliente(db, cliente.id) == {"proyectos": 1, "cotizaciones": 0}
    assert reporte._impacto_proyecto(db, proyecto.id) == {
        "cotizaciones": 0,
        "despachos": 0,
        "recepciones": 0,
    }
