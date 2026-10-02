"""Pruebas de la corrección de datos del proyecto (PATCH /api/proyectos/{id})."""

from datetime import datetime

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.models.cliente import Cliente, TipoIdentificacion
from app.models.proyecto import EstadoProyecto, Proyecto
from app.models.usuario import RolUsuario, Usuario
from app.schemas.proyecto import ProyectoActualizar
from app.services.proyecto import actualizar_proyecto


@pytest.fixture
def proyecto(db: Session) -> Proyecto:
    marca = datetime.now().timestamp()
    usuario = Usuario(
        nombre="Gerente",
        email=f"gerente-{marca}@example.com",
        password_hash="no-se-usa",
        rol=RolUsuario.GERENTE_GENERAL,
    )
    cliente = Cliente(
        nombre="Cliente de prueba",
        tipo_identificacion=TipoIdentificacion.RUC,
        identificacion=str(int(marca * 1000))[-13:].rjust(13, "1"),
    )
    db.add_all([usuario, cliente])
    db.flush()

    p = Proyecto(
        nombre="Planta original",
        cliente_id=cliente.id,
        usuario_id=usuario.id,
        ubicacion="Ibarra",
        latitud=None,
        notas="nota inicial",
    )
    db.add(p)
    db.flush()
    return p


def test_cambia_solo_lo_enviado(db: Session, proyecto: Proyecto):
    resultado = actualizar_proyecto(db, proyecto, ProyectoActualizar(latitud=0.3517))

    assert float(resultado.latitud) == pytest.approx(0.3517)
    assert resultado.nombre == "Planta original"
    assert resultado.ubicacion == "Ibarra"
    assert resultado.notas == "nota inicial"


def test_null_borra_un_campo_opcional(db: Session, proyecto: Proyecto):
    resultado = actualizar_proyecto(db, proyecto, ProyectoActualizar(notas=None))
    assert resultado.notas is None


def test_texto_en_blanco_se_guarda_como_null(db: Session, proyecto: Proyecto):
    resultado = actualizar_proyecto(db, proyecto, ProyectoActualizar(ubicacion="   "))
    assert resultado.ubicacion is None


def test_recorta_espacios_del_nombre(db: Session, proyecto: Proyecto):
    resultado = actualizar_proyecto(db, proyecto, ProyectoActualizar(nombre="  Planta norte  "))
    assert resultado.nombre == "Planta norte"


def test_no_cambia_estado_ni_cliente(db: Session, proyecto: Proyecto):
    cliente_antes = proyecto.cliente_id
    resultado = actualizar_proyecto(
        db, proyecto, ProyectoActualizar.model_validate({"estado": "cotizado", "cliente_id": 999})
    )
    assert resultado.estado == EstadoProyecto.BORRADOR
    assert resultado.cliente_id == cliente_antes


def test_nombre_null_se_rechaza():
    with pytest.raises(ValidationError, match="no puede quedar vacío"):
        ProyectoActualizar(nombre=None)


def test_latitud_fuera_de_rango_se_rechaza():
    with pytest.raises(ValidationError):
        ProyectoActualizar(latitud=95)
