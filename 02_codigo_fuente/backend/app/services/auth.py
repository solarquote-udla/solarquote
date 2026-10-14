"""
Lógica de negocio de autenticación (RF-11).

Los servicios contienen las reglas del negocio. Los routers solo traducen
entre HTTP y estos servicios — así la lógica es testeable sin levantar la API.

Cómo se protege el login:
  - El mensaje de error es el mismo si el correo no existe o si la
    contraseña es incorrecta, y ambos casos hacen el mismo trabajo, para
    que el tiempo de respuesta no delate qué correos están registrados:
      1. un SELECT del usuario, sin cargas adicionales;
      2. una verificación bcrypt (contra un hash señuelo si no existe);
      3. un UPDATE ... RETURNING del contador de intentos (sobre un id
         que no existe si el correo no está registrado) y un COMMIT.
    `tests/test_seguridad.py` verifica que ambos casos ejecuten las mismas
    sentencias.
  - Tras `MAX_INTENTOS_LOGIN` contraseñas incorrectas seguidas, la cuenta
    se bloquea `MINUTOS_BLOQUEO_LOGIN` minutos. Durante el bloqueo ni
    siquiera se verifica la contraseña, así que no sirve seguir probando.
  - Una cuenta desactivada solo se informa como tal si la contraseña es
    correcta.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session, lazyload

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


def _usuario_para_login(db: Session, email: str) -> Usuario | None:
    """
    Solo la fila del usuario, sin el perfil ni sus permisos: así la
    consulta cuesta lo mismo exista o no el correo. El perfil se carga
    después, solo si el login es correcto.
    """
    sentencia = (
        select(Usuario).options(lazyload(Usuario.perfil)).where(Usuario.email == email.lower().strip())
    )
    return db.execute(sentencia).scalar_one_or_none()


# Id que ningún usuario tiene (la columna es SERIAL, empieza en 1)
_ID_INEXISTENTE = -1


def _sumar_intento_fallido(db: Session, usuario_id: int | None) -> int | None:
    """
    Suma un intento fallido y devuelve el total. Con `usuario_id=None`
    ejecuta la misma sentencia sobre un id inexistente: no cambia nada,
    pero cuesta lo mismo que el caso real.
    """
    resultado = db.execute(
        update(Usuario)
        .where(Usuario.id == (usuario_id if usuario_id is not None else _ID_INEXISTENTE))
        .values(intentos_fallidos=Usuario.intentos_fallidos + 1)
        .returning(Usuario.intentos_fallidos)
        .execution_options(synchronize_session=False)
    )
    intentos = resultado.scalar_one_or_none()
    db.commit()
    return intentos


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
    usuario = _usuario_para_login(db, email)

    if usuario is None:
        verificar_password_señuelo(password)
        _sumar_intento_fallido(db, None)
        raise CredencialesInvalidas()

    if usuario.bloqueado:
        raise CuentaBloqueada(_minutos_restantes(usuario.bloqueado_hasta))

    if not verificar_password(password, usuario.password_hash):
        usuario_id = usuario.id
        intentos = _sumar_intento_fallido(db, usuario_id) or 0
        if intentos >= settings.MAX_INTENTOS_LOGIN:
            # Solo al quinto intento hay una sentencia más: en ese momento
            # el 429 ya informa que la cuenta existe (ver DS-08)
            db.execute(
                update(Usuario)
                .where(Usuario.id == usuario_id)
                .values(
                    intentos_fallidos=0,
                    bloqueado_hasta=_ahora() + timedelta(minutes=settings.MINUTOS_BLOQUEO_LOGIN),
                )
                .execution_options(synchronize_session=False)
            )
            db.commit()
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
