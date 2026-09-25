"""
Lógica de negocio de autenticación.

Los servicios contienen las reglas del negocio. Los routers solo traducen
entre HTTP y estos servicios — así la lógica es testeable sin levantar la API.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password, verificar_password
from app.models.usuario import Usuario
from app.schemas.usuario import UsuarioCrear


def obtener_usuario_por_email(db: Session, email: str) -> Usuario | None:
    """Busca un usuario por su email (único en la tabla)."""
    sentencia = select(Usuario).where(Usuario.email == email.lower().strip())
    return db.execute(sentencia).scalar_one_or_none()


def obtener_usuario_por_id(db: Session, usuario_id: int) -> Usuario | None:
    """Busca un usuario por su id."""
    return db.get(Usuario, usuario_id)


def crear_usuario(db: Session, datos: UsuarioCrear) -> Usuario:
    """
    Registra un usuario nuevo.

    Lanza ValueError si el email ya está registrado.
    """
    email_normalizado = datos.email.lower().strip()

    if obtener_usuario_por_email(db, email_normalizado):
        raise ValueError("Ya existe un usuario registrado con ese correo")

    usuario = Usuario(
        nombre=datos.nombre.strip(),
        email=email_normalizado,
        password_hash=hash_password(datos.password),
        rol=datos.rol,
        activo=True,
    )

    db.add(usuario)
    db.commit()
    db.refresh(usuario)

    return usuario


def autenticar_usuario(db: Session, email: str, password: str) -> Usuario | None:
    """
    Verifica las credenciales.

    Devuelve el usuario si son correctas, None si no.
    No distingue entre "email no existe" y "contraseña incorrecta" —
    eso evita que un atacante averigüe qué correos están registrados.
    """
    usuario = obtener_usuario_por_email(db, email)

    if usuario is None:
        return None

    if not usuario.activo:
        return None

    if not verificar_password(password, usuario.password_hash):
        return None

    return usuario
