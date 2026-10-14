"""
Administración de perfiles y usuarios (RF-11).

Reglas que protegen al sistema de quedarse sin administrador o de que
alguien se otorgue más acceso del que tiene:

  Nadie se otorga más de lo que tiene (quien no tiene acceso total):
    - No modifica los permisos de su propio perfil.
    - No otorga a un perfil permisos que su propio perfil no tiene.
    - No asigna a un usuario un perfil con permisos que él no tiene, ni
      administra a usuarios cuyo perfil tiene permisos que él no tiene.
    Sin estas reglas, quien tuviera "perfiles" o "usuarios" podría
    agregarse todo el catálogo, directamente o a través de otra cuenta.

  Perfiles
    - El perfil Gerente General (acceso total) no se modifica ni se elimina.
    - Los perfiles del sistema no se renombran ni se eliminan.
    - Un perfil con usuarios asignados no se elimina.

  Usuarios
    - Solo quien tiene acceso total puede asignar el perfil Gerente
      General, ni modificar o restablecer la contraseña de un Gerente.
    - Nadie cambia su propio perfil ni desactiva su propia cuenta.
    - Siempre queda al menos un Gerente General activo. La verificación
      bloquea las filas de los gerentes (SELECT ... FOR UPDATE) para que
      dos desactivaciones simultáneas no dejen al sistema sin ninguno.
    - Los usuarios no se eliminan: se desactivan (baja lógica), porque
      sus proyectos y cotizaciones los referencian.
"""

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.perfil import Perfil
from app.models.usuario import Usuario
from app.schemas.usuario import (
    PerfilActualizar,
    PerfilCrear,
    UsuarioActualizar,
    UsuarioCrear,
)


class ReglaSeguridad(Exception):
    """Violación de una regla. `status_code` es el HTTP que corresponde."""

    status_code = 409

    def __init__(self, mensaje: str) -> None:
        self.mensaje = mensaje
        super().__init__(mensaje)


class NoEncontrado(ReglaSeguridad):
    status_code = 404


class Conflicto(ReglaSeguridad):
    status_code = 409


class OperacionNoPermitida(ReglaSeguridad):
    status_code = 403


class DatoInvalido(ReglaSeguridad):
    status_code = 422


# ─── Regla de no escalar privilegios ────────────────────

def _permisos_ajenos(actor: Usuario, permisos: set[str]) -> set[str]:
    """Permisos de la lista que el actor no tiene. Vacío con acceso total."""
    if actor.perfil.acceso_total:
        return set()
    return permisos - actor.permisos


def _exigir_permisos_propios(actor: Usuario, permisos: set[str], accion: str) -> None:
    ajenos = _permisos_ajenos(actor, permisos)
    if ajenos:
        lista = ", ".join(sorted(ajenos))
        raise OperacionNoPermitida(f"No puedes {accion} con permisos que tu perfil no tiene: {lista}")


# ─── Perfiles ───────────────────────────────────────────

def _usuarios_por_perfil(db: Session) -> dict[int, int]:
    filas = db.execute(select(Usuario.perfil_id, func.count()).group_by(Usuario.perfil_id))
    return {perfil_id: total for perfil_id, total in filas}


def listar_perfiles(db: Session) -> list[tuple[Perfil, int]]:
    """Sistema primero, luego los personalizados por nombre."""
    perfiles = db.execute(
        select(Perfil).order_by(Perfil.clave.is_(None), Perfil.acceso_total.desc(), Perfil.nombre)
    ).scalars().all()
    conteo = _usuarios_por_perfil(db)
    return [(p, conteo.get(p.id, 0)) for p in perfiles]


def obtener_perfil(db: Session, perfil_id: int) -> Perfil:
    perfil = db.get(Perfil, perfil_id)
    if perfil is None:
        raise NoEncontrado("El perfil no existe")
    return perfil


def contar_usuarios(db: Session, perfil_id: int) -> int:
    return db.scalar(select(func.count()).where(Usuario.perfil_id == perfil_id)) or 0


def _nombre_disponible(db: Session, nombre: str, excepto_id: int | None = None) -> None:
    sentencia = select(Perfil.id).where(func.lower(Perfil.nombre) == nombre.lower())
    if excepto_id is not None:
        sentencia = sentencia.where(Perfil.id != excepto_id)
    if db.scalar(sentencia) is not None:
        raise Conflicto(f"Ya existe un perfil llamado «{nombre}»")


def crear_perfil(db: Session, actor: Usuario, datos: PerfilCrear) -> Perfil:
    _exigir_permisos_propios(actor, {p.value for p in datos.permisos}, "crear un perfil")
    _nombre_disponible(db, datos.nombre)
    perfil = Perfil(nombre=datos.nombre, descripcion=datos.descripcion, acceso_total=False)
    perfil.asignar_permisos({p.value for p in datos.permisos})
    db.add(perfil)
    db.commit()
    db.refresh(perfil)
    return perfil


def actualizar_perfil(db: Session, actor: Usuario, perfil: Perfil, datos: PerfilActualizar) -> Perfil:
    if perfil.acceso_total:
        raise Conflicto("El perfil Gerente General tiene acceso total y no se puede modificar")
    if perfil.id == actor.perfil_id and not actor.perfil.acceso_total:
        raise OperacionNoPermitida("No puedes modificar tu propio perfil")

    cambios = datos.model_dump(exclude_unset=True)

    if "nombre" in cambios:
        if cambios["nombre"] is None:
            raise DatoInvalido("El nombre es obligatorio")
        if perfil.es_sistema and cambios["nombre"] != perfil.nombre:
            raise Conflicto("Los perfiles del sistema no se pueden renombrar")
        _nombre_disponible(db, cambios["nombre"], excepto_id=perfil.id)
        perfil.nombre = cambios["nombre"]

    if "descripcion" in cambios:
        perfil.descripcion = cambios["descripcion"]

    if "permisos" in cambios:
        if datos.permisos is None:
            raise DatoInvalido("Envía la lista de permisos (puede estar vacía)")
        nuevos = {p.value for p in datos.permisos}
        # Quitar permisos siempre se puede; agregar, solo los que el actor tiene
        _exigir_permisos_propios(actor, nuevos - perfil.permisos, "otorgar permisos")
        perfil.asignar_permisos(nuevos)

    db.commit()
    db.refresh(perfil)
    return perfil


def eliminar_perfil(db: Session, perfil: Perfil) -> None:
    if perfil.es_sistema:
        raise Conflicto("Los perfiles del sistema no se pueden eliminar")
    asignados = contar_usuarios(db, perfil.id)
    if asignados:
        raise Conflicto(
            f"El perfil tiene {asignados} usuario{'s' if asignados != 1 else ''} asignado"
            f"{'s' if asignados != 1 else ''}; cámbialos de perfil antes de eliminarlo"
        )
    db.delete(perfil)
    try:
        db.commit()
    except IntegrityError:
        # Alguien asignó un usuario entre el conteo y el borrado: la FK
        # (ondelete RESTRICT) lo impide y se responde 409, no 500
        db.rollback()
        raise Conflicto("El perfil acaba de recibir usuarios; cámbialos de perfil antes de eliminarlo") from None


# ─── Usuarios ───────────────────────────────────────────

def listar_usuarios(
    db: Session,
    *,
    busqueda: str | None = None,
    perfil_id: int | None = None,
    estado: str | None = None,
) -> list[Usuario]:
    sentencia = select(Usuario).order_by(Usuario.nombre)
    if busqueda:
        patron = f"%{busqueda.strip().lower()}%"
        sentencia = sentencia.where(
            func.lower(Usuario.nombre).like(patron) | func.lower(Usuario.email).like(patron)
        )
    if perfil_id is not None:
        sentencia = sentencia.where(Usuario.perfil_id == perfil_id)
    if estado == "inactivo":
        sentencia = sentencia.where(Usuario.activo.is_(False))
    elif estado == "pendiente":
        sentencia = sentencia.where(Usuario.activo.is_(True), Usuario.debe_cambiar_password.is_(True))
    elif estado == "activo":
        sentencia = sentencia.where(Usuario.activo.is_(True), Usuario.debe_cambiar_password.is_(False))
    return list(db.execute(sentencia).unique().scalars().all())


def obtener_usuario(db: Session, usuario_id: int) -> Usuario:
    usuario = db.get(Usuario, usuario_id)
    if usuario is None:
        raise NoEncontrado("El usuario no existe")
    return usuario


def _email_disponible(db: Session, email: str, excepto_id: int | None = None) -> None:
    sentencia = select(Usuario.id).where(Usuario.email == email)
    if excepto_id is not None:
        sentencia = sentencia.where(Usuario.id != excepto_id)
    if db.scalar(sentencia) is not None:
        raise Conflicto("Ya existe un usuario registrado con ese correo")


def _gerentes_activos(db: Session) -> int:
    """
    Cuenta los gerentes activos bloqueando sus filas hasta el commit.

    Sin el bloqueo, dos peticiones simultáneas que desactivan a dos
    gerentes distintos contarían 2 cada una y ambas pasarían. Con FOR
    UPDATE, la segunda espera a que la primera termine y, al reevaluar,
    ya no cuenta al gerente desactivado.
    """
    filas = db.execute(
        select(Usuario.id)
        .join(Perfil, Perfil.id == Usuario.perfil_id)
        .where(Perfil.acceso_total.is_(True), Usuario.activo.is_(True))
        .with_for_update(of=Usuario)
    ).all()
    return len(filas)


def _exigir_acceso_total(actor: Usuario, motivo: str) -> None:
    if not actor.perfil.acceso_total:
        raise OperacionNoPermitida(motivo)


def _exigir_puede_administrar(actor: Usuario, perfil: Perfil, accion: str) -> None:
    """El perfil (del usuario o el que se le asigna) no tiene más que el actor."""
    if perfil.acceso_total:
        _exigir_acceso_total(actor, f"Solo un Gerente General puede {accion} con el perfil Gerente General")
    _exigir_permisos_propios(actor, perfil.permisos, accion)


def crear_usuario(db: Session, actor: Usuario, datos: UsuarioCrear) -> Usuario:
    """Alta con contraseña temporal: el usuario deberá cambiarla al ingresar."""
    _email_disponible(db, datos.email)
    perfil = db.get(Perfil, datos.perfil_id)
    if perfil is None:
        raise DatoInvalido("El perfil no existe")
    _exigir_puede_administrar(actor, perfil, "crear un usuario")

    usuario = Usuario(
        nombre=datos.nombre,
        email=datos.email,
        password_hash=hash_password(datos.password_temporal),
        perfil_id=perfil.id,
        activo=True,
        debe_cambiar_password=True,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


def actualizar_usuario(db: Session, actor: Usuario, usuario: Usuario, datos: UsuarioActualizar) -> Usuario:
    cambios = datos.model_dump(exclude_unset=True)
    for campo in ("nombre", "email", "activo", "perfil_id"):
        if campo in cambios and cambios[campo] is None:
            raise DatoInvalido(f"El campo {campo} no puede ser nulo")

    if actor.id != usuario.id:
        _exigir_puede_administrar(actor, usuario.perfil, "modificar a un usuario")

    nuevo_perfil = usuario.perfil
    if "perfil_id" in cambios and cambios["perfil_id"] != usuario.perfil_id:
        if actor.id == usuario.id:
            raise OperacionNoPermitida("No puedes cambiar tu propio perfil")
        nuevo_perfil = db.get(Perfil, cambios["perfil_id"])
        if nuevo_perfil is None:
            raise DatoInvalido("El perfil no existe")
        _exigir_puede_administrar(actor, nuevo_perfil, "asignar un perfil")

    nuevo_activo = cambios.get("activo", usuario.activo)
    if actor.id == usuario.id and not nuevo_activo:
        raise OperacionNoPermitida("No puedes desactivar tu propia cuenta")

    # ¿Este cambio deja al sistema sin un Gerente General activo?
    era_gerente_activo = usuario.activo and usuario.perfil.acceso_total
    sigue_gerente_activo = nuevo_activo and nuevo_perfil.acceso_total
    if era_gerente_activo and not sigue_gerente_activo and _gerentes_activos(db) <= 1:
        raise Conflicto("Debe quedar al menos un usuario activo con perfil Gerente General")

    if "email" in cambios:
        _email_disponible(db, cambios["email"], excepto_id=usuario.id)
        usuario.email = cambios["email"]
    if "nombre" in cambios:
        usuario.nombre = " ".join(cambios["nombre"].split())
    if nuevo_perfil is not usuario.perfil:
        usuario.perfil = nuevo_perfil

    if nuevo_activo != usuario.activo:
        usuario.activo = nuevo_activo
        if nuevo_activo:
            usuario.intentos_fallidos = 0
            usuario.bloqueado_hasta = None
        else:
            usuario.version_token += 1  # cierra sus sesiones abiertas

    db.commit()
    db.refresh(usuario)
    return usuario


def restablecer_password(db: Session, actor: Usuario, usuario: Usuario, password_temporal: str) -> Usuario:
    """
    Asigna una contraseña temporal, desbloquea la cuenta y cierra las
    sesiones abiertas. Es el camino de "¿Olvidaste tu contraseña?".
    """
    if actor.id == usuario.id:
        raise OperacionNoPermitida("Para tu propia cuenta usa «Cambiar contraseña»")
    # Restablecer la contraseña de alguien con más permisos sería tomar su cuenta
    _exigir_puede_administrar(actor, usuario.perfil, "restablecer la contraseña de un usuario")

    usuario.password_hash = hash_password(password_temporal)
    usuario.debe_cambiar_password = True
    usuario.intentos_fallidos = 0
    usuario.bloqueado_hasta = None
    usuario.version_token += 1
    db.commit()
    db.refresh(usuario)
    return usuario
