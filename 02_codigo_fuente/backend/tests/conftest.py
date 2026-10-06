"""
Fixtures compartidas de pytest.

`db` entrega una sesión real contra el Postgres de pruebas, dentro de una
transacción que se revierte al final de cada test: no hace falta limpiar
datos a mano ni depender del orden en que corren los tests.

Protección de la base de desarrollo
-----------------------------------
Al terminar, las pruebas ejecutan `drop_all`: borran todas las tablas.
Con la DATABASE_URL del `.env` local eso destruiría la base de
desarrollo. Por eso las pruebas con base de datos solo corren contra una
base cuyo nombre lo declare como de pruebas: que contenga `test` o
termine en `_ci` (en el CI es `solarquote_ci`).

Para correrlas en local, crea una base aparte (por ejemplo una rama
`test` en Neon con la base `solarquote_test`) y define:

    TEST_DATABASE_URL=postgresql://.../solarquote_test

Si no hay una base de pruebas, las pruebas que usan `db` se saltan con un
aviso y las pruebas puras (geometría, layout, cálculo) corren igual.
"""

import os
import re

import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

import app.models  # noqa: F401 — registra las tablas en Base.metadata
from app.core.config import settings
from app.core.database import Base

URL_PRUEBAS = os.getenv("TEST_DATABASE_URL") or settings.DATABASE_URL


def _es_base_de_pruebas(url: str) -> bool:
    nombre = make_url(url).database or ""
    return bool(re.search(r"test", nombre, re.IGNORECASE) or nombre.endswith("_ci"))


@pytest.fixture(scope="session")
def _engine() -> Engine:
    if not _es_base_de_pruebas(URL_PRUEBAS):
        pytest.skip(
            f"La base '{make_url(URL_PRUEBAS).database}' no es de pruebas y estas pruebas "
            f"borran todas las tablas al terminar. Define TEST_DATABASE_URL apuntando a una "
            f"base cuyo nombre contenga 'test' (ver tests/conftest.py)."
        )

    engine = create_engine(URL_PRUEBAS)
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def db(_engine: Engine) -> Session:
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
