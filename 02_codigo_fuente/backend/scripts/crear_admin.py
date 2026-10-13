"""
Crea el primer usuario Gerente General del sistema.

Se necesita porque el alta de usuarios (POST /api/usuarios) está
protegida: solo un usuario con el permiso `usuarios` puede crear otros, así
que el primero hay que sembrarlo desde aquí.

El perfil Gerente General lo crea la migración de perfiles; corre antes
`alembic upgrade head`. Este usuario elige su propia contraseña, así que
no se le pide cambiarla al primer acceso.

Uso (desde la carpeta backend/, con el venv activado):
    python -m scripts.crear_admin
"""

import sys
from getpass import getpass
from pathlib import Path

# Permite importar `app` cuando se ejecuta el script directamente
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pydantic import TypeAdapter, ValidationError  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.core.permisos import CLAVE_GERENTE_GENERAL  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.perfil import Perfil  # noqa: E402
from app.models.usuario import Usuario  # noqa: E402
from app.schemas.usuario import PasswordNueva  # noqa: E402
from app.services.auth import obtener_usuario_por_email  # noqa: E402


def main() -> int:
    print("─── Crear Gerente General ───\n")

    nombre = " ".join(input("Nombre completo: ").split())
    email = input("Correo: ").strip().lower()
    password = getpass("Contraseña (mínimo 8 caracteres, con letras y números): ")
    confirmacion = getpass("Repite la contraseña: ")

    if password != confirmacion:
        print("\nError: Las contraseñas no coinciden.")
        return 1
    if len(nombre) < 2 or "@" not in email:
        print("\nError: Nombre o correo inválidos.")
        return 1
    try:
        TypeAdapter(PasswordNueva).validate_python(password)
    except ValidationError as exc:
        print(f"\nError: Contraseña inválida: {exc.errors()[0]['msg']}")
        return 1

    db = SessionLocal()
    try:
        perfil = db.query(Perfil).filter(Perfil.clave == CLAVE_GERENTE_GENERAL).one_or_none()
        if perfil is None:
            print("\nError: No existe el perfil Gerente General. Corre primero:  alembic upgrade head")
            return 1

        if obtener_usuario_por_email(db, email):
            print(f"\nError: Ya existe un usuario con el correo {email}")
            return 1

        usuario = Usuario(
            nombre=nombre,
            email=email,
            password_hash=hash_password(password),
            perfil_id=perfil.id,
            activo=True,
            debe_cambiar_password=False,
        )
        db.add(usuario)
        db.commit()
        print(f"\nListo: Usuario creado: {usuario.email} (id {usuario.id})")
        print("  Ya puedes iniciar sesión en POST /api/auth/login")
        return 0

    except Exception as exc:
        print(f"\nError: Error al crear el usuario: {exc}")
        return 1

    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
