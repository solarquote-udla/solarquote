"""
Datos de prueba compartidos para la seguridad (RF-11).

Las pruebas crean las tablas con `create_all`, no con las migraciones, así
que los perfiles del sistema no existen de entrada: estas funciones los
crean dentro de la transacción del test (se revierten al terminar), igual
que lo hace la migración `9c1e4b7a2d50`.
"""

from itertools import count

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.permisos import (
    CLAVE_GERENTE_GENERAL,
    CLAVE_PERSONAL_PRODUCCION,
    PERMISOS_INICIALES_PRODUCCION,
    Permiso,
)
from app.core.security import hash_password
from app.models.perfil import Perfil
from app.models.usuario import Usuario

PASSWORD = "Clave1234"
_secuencia = count(1)
_hash_password: str | None = None


def _hash() -> str:
    # bcrypt es lento a propósito; un hash para todas las pruebas basta
    global _hash_password
    if _hash_password is None:
        _hash_password = hash_password(PASSWORD)
    return _hash_password


def perfil_gerente(db: Session) -> Perfil:
    perfil = db.scalar(select(Perfil).where(Perfil.clave == CLAVE_GERENTE_GENERAL))
    if perfil is None:
        perfil = Perfil(nombre="Gerente General", clave=CLAVE_GERENTE_GENERAL, acceso_total=True)
        db.add(perfil)
        db.flush()
    return perfil


def perfil_produccion(db: Session) -> Perfil:
    perfil = db.scalar(select(Perfil).where(Perfil.clave == CLAVE_PERSONAL_PRODUCCION))
    if perfil is None:
        perfil = Perfil(nombre="Personal de Producción", clave=CLAVE_PERSONAL_PRODUCCION)
        perfil.asignar_permisos({p.value for p in PERMISOS_INICIALES_PRODUCCION})
        db.add(perfil)
        db.flush()
    return perfil


def perfil_personalizado(db: Session, *permisos: Permiso, nombre: str | None = None) -> Perfil:
    perfil = Perfil(nombre=nombre or f"Perfil {next(_secuencia)}")
    perfil.asignar_permisos({p.value for p in permisos})
    db.add(perfil)
    db.flush()
    return perfil


def crear_usuario(db: Session, perfil: Perfil | None = None, **campos) -> Usuario:
    n = next(_secuencia)
    usuario = Usuario(
        nombre=campos.pop("nombre", f"Usuario {n}"),
        email=campos.pop("email", f"usuario-{n}-{id(db)}@example.com"),
        password_hash=campos.pop("password_hash", None) or _hash(),
        perfil=perfil or perfil_gerente(db),
        **campos,
    )
    db.add(usuario)
    db.flush()
    return usuario
