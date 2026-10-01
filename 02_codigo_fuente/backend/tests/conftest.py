"""
Fixtures compartidas de pytest.

`db` entrega una sesión real contra el Postgres de pruebas (la misma
DATABASE_URL que usa alembic), dentro de una transacción que se revierte
al final de cada test: no hace falta limpiar datos a mano ni depender
del orden en que corren los tests.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

import app.models  # noqa: F401 — registra las tablas en Base.metadata
from app.core.config import settings
from app.core.database import Base

_engine = create_engine(settings.DATABASE_URL)


@pytest.fixture(scope="session", autouse=True)
def _tablas():
    Base.metadata.create_all(_engine)
    yield
    Base.metadata.drop_all(_engine)


@pytest.fixture
def db() -> Session:
    """
    Sesión dentro de una transacción que se revierte al final del test.

    `join_transaction_mode="create_savepoint"` es necesario porque la
    conexión ya tiene una transacción abierta (la que se revierte): sin
    esto, la Session intenta abrir la suya propia y el rollback de abajo
    no hace nada (los datos de un test quedan para el siguiente).
    """
    conexion = _engine.connect()
    transaccion = conexion.begin()
    sesion = Session(bind=conexion, join_transaction_mode="create_savepoint")
    try:
        yield sesion
    finally:
        sesion.close()
        transaccion.rollback()
        conexion.close()
