"""
Lógica de negocio de autenticación (RF-11).

Los servicios contienen las reglas del negocio. Los routers solo traducen
entre HTTP y estos servicios — así la lógica es testeable sin levantar la API.

Cómo se protege el login:
  - El mensaje de error es el mismo si el correo no existe o si la
    contraseña es incorrecta, y ambos casos tardan lo mismo (se verifica
    un hash señuelo): no se puede averiguar qué correos están registrados.
  - Tras `MAX_INTENTOS_LOGIN` contraseñas incorrectas seguidas, la cuenta
    se bloquea `MINUTOS_BLOQUEO_LOGIN` minutos. Durante el bloqueo ni
    siquiera se verifica la contraseña, así que no sirve seguir probando.
  - Una cuenta desactivada solo se informa como tal si la contraseña es
    correcta.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password, verificar_password, verificar_password_señuelo
from app.models.usuario import Usuario


class CredencialesInvalidas(Exception):
    pass


class CuentaBloqueada(Exception):
    def __init__(self, minutos: int) -> None:
        self.minutos = minutos
        super().__init__(
            f"Demasiados intentos fallidos. Intenta de nuevo en {minutos} "
            f"minuto{'s' if minutos != 1 else ''} o pide al administrador que restablezca tu contraseña."
        )


class CuentaDesactivada(Exception):
    pass


class PasswordActualIncorrecta(Exception):
    pass


class PasswordRepetida(Exception):
    pass


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def obtener_usuario_por_email(db: Session, email: str) -> Usuario | None:
    """Busca un usuario por su email (único en la tabla)."""
    sentencia = select(Usuario).where(Usuario.email == email.lower().strip())
    return db.execute(sentencia).unique().scalar_one_or_none()


def obtener_usuario_por_id(db: Session, usuario_id: int) -> Usuario | None:
    """Busca un usuario por su id."""
    return db.get(Usuario, usuario_id)


def _minutos_restantes(hasta: datetime) -> int:
    segundos = (hasta - _ahora()).total_seconds()
    return max(1, int(-(-segundos // 60)))  # redondeo hacia arriba


def autenticar(db: Session, email: str, password: str) -> Usuario:
    """
    Verifica las credenciales y registra el acceso.

    Lanza CredencialesInvalidas, CuentaBloqueada o CuentaDesactivada.
    """
    usuario = obtener_usuario_por_email(db, email)

    if usuario is None:
        verificar_password_señuelo(password)
        raise CredencialesInvalidas()

    if usuario.bloqueado:
        raise CuentaBloqueada(_minutos_restantes(usuario.bloqueado_hasta))

    if not verificar_password(password, usuario.password_hash):
        usuario.intentos_fallidos += 1
        bloquear = usuario.intentos_fallidos >= settings.MAX_INTENTOS_LOGIN
        if bloquear:
            usuario.bloqueado_hasta = _ahora() + timedelta(minutes=settings.MINUTOS_BLOQUEO_LOGIN)
            usuario.intentos_fallidos = 0
        db.commit()
        if bloquear:
            raise CuentaBloqueada(settings.MINUTOS_BLOQUEO_LOGIN)
        raise CredencialesInvalidas()

    if not usuario.activo:
        raise CuentaDesactivada()

    usuario.intentos_fallidos = 0
    usuario.bloqueado_hasta = None
    usuario.ultimo_acceso = _ahora()
    db.commit()
    db.refresh(usuario)
    return usuario


def cambiar_password(db: Session, usuario: Usuario, actual: str, nueva: str) -> Usuario:
    """
    El usuario cambia su propia contraseña (también la temporal).

    Invalida los tokens emitidos antes: el router entrega uno nuevo.
    """
    if not verificar_password(actual, usuario.password_hash):
        raise PasswordActualIncorrecta()
    if verificar_password(nueva, usuario.password_hash):
        raise PasswordRepetida()

    usuario.password_hash = hash_password(nueva)
    usuario.debe_cambiar_password = False
    usuario.version_token += 1
    db.commit()
    db.refresh(usuario)
    return usuario
