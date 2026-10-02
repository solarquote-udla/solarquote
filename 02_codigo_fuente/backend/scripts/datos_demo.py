"""
Siembra un cliente y un proyecto de demostración en la base de desarrollo.

Existe para destrabar el Módulo 1 mientras el CRUD de clientes (RF-12)
está en desarrollo: sin un cliente no se puede crear un proyecto, y sin
un proyecto no hay dónde definir el terreno.

Es idempotente: si los datos ya existen, no los duplica.

Uso (desde la carpeta backend/, con el venv activado):
    python -m scripts.datos_demo

Requiere haber creado antes un Gerente General con:
    python -m scripts.crear_admin
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.models.cliente import Cliente, TipoIdentificacion  # noqa: E402
from app.models.proyecto import Proyecto  # noqa: E402
from app.models.usuario import RolUsuario, Usuario  # noqa: E402

# RUC válido (pasa la validación de RF-12) de una cédula de ejemplo
# documentada en CONTRATO-CLIENTES.md, para que este cliente demo se
# pueda editar desde la interfaz sin que el formulario lo rechace.
IDENTIFICACION_DEMO = "1710034065001"
NOMBRE_PROYECTO_DEMO = "Proyecto demo — Planta fotovoltaica Imbabura"


def main() -> int:
    # Guarda contra el error más caro: sembrar datos falsos en producción.
    if settings.ENVIRONMENT == "production":
        print("✗ ENVIRONMENT=production. Este script solo corre en desarrollo.")
        return 1

    db = SessionLocal()
    try:
        gerente = (
            db.query(Usuario)
            .filter(Usuario.rol == RolUsuario.GERENTE_GENERAL, Usuario.activo.is_(True))
            .order_by(Usuario.id)
            .first()
        )
        if gerente is None:
            print("✗ No hay un Gerente General activo.")
            print("  Créalo primero con:  python -m scripts.crear_admin")
            return 1

        cliente = (
            db.query(Cliente)
            .filter(Cliente.identificacion == IDENTIFICACION_DEMO)
            .one_or_none()
        )
        if cliente is None:
            cliente = Cliente(
                nombre="Cliente Demo S.A.",
                tipo_identificacion=TipoIdentificacion.RUC,
                identificacion=IDENTIFICACION_DEMO,
                empresa="Cliente Demo S.A.",
                email="demo@solarquote.local",
                direccion="Ibarra, Imbabura",
            )
            db.add(cliente)
            db.flush()
            print(f"✓ Cliente demo creado (id {cliente.id})")
        else:
            print(f"· Cliente demo ya existía (id {cliente.id})")

        proyecto = (
            db.query(Proyecto)
            .filter(
                Proyecto.cliente_id == cliente.id,
                Proyecto.nombre == NOMBRE_PROYECTO_DEMO,
            )
            .one_or_none()
        )
        if proyecto is None:
            proyecto = Proyecto(
                nombre=NOMBRE_PROYECTO_DEMO,
                cliente_id=cliente.id,
                usuario_id=gerente.id,
                ubicacion="Imbabura, Ibarra — sector de prueba",
                latitud=0.3517,
                longitud=-78.1223,
            )
            db.add(proyecto)
            db.flush()
            print(f"✓ Proyecto demo creado (id {proyecto.id})")
        else:
            print(f"· Proyecto demo ya existía (id {proyecto.id})")

        db.commit()
        print(f"\nAbre el terreno en:  /proyectos/{proyecto.id}/terreno")
        return 0

    except Exception as exc:
        db.rollback()
        print(f"✗ Error al sembrar los datos: {exc}")
        return 1

    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
