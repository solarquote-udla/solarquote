"""
Crea el primer usuario Gerente General del sistema.

Se necesita porque el endpoint /api/auth/registro está protegido: solo un
Gerente General puede crear usuarios, así que el primero hay que sembrarlo
desde aquí.

Uso (desde la carpeta backend/, con el venv activado):
    python -m scripts.crear_admin
"""

import sys
from getpass import getpass
from pathlib import Path

# Permite importar `app` cuando se ejecuta el script directamente
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.database import SessionLocal  # noqa: E402
from app.models.usuario import RolUsuario  # noqa: E402
from app.schemas.usuario import UsuarioCrear  # noqa: E402
from app.services.auth import crear_usuario, obtener_usuario_por_email  # noqa: E402


def main() -> int:
    print("─── Crear Gerente General ───\n")

    nombre = input("Nombre completo: ").strip()
    email = input("Correo: ").strip().lower()
    password = getpass("Contraseña (mínimo 8 caracteres): ")
    confirmacion = getpass("Repite la contraseña: ")

    if password != confirmacion:
        print("\n✗ Las contraseñas no coinciden.")
        return 1

    try:
        datos = UsuarioCrear(
            nombre=nombre,
            email=email,
            password=password,
            rol=RolUsuario.GERENTE_GENERAL,
        )
    except Exception as exc:
        print(f"\n✗ Datos inválidos: {exc}")
        return 1

    db = SessionLocal()
    try:
        if obtener_usuario_por_email(db, email):
            print(f"\n✗ Ya existe un usuario con el correo {email}")
            return 1

        usuario = crear_usuario(db, datos)
        print(f"\n✓ Usuario creado: {usuario.email} (id {usuario.id})")
        print("  Ya puedes iniciar sesión en POST /api/auth/login")
        return 0

    except Exception as exc:
        print(f"\n✗ Error al crear el usuario: {exc}")
        return 1

    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
