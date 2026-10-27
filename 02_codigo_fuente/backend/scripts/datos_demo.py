"""
Siembra datos de demostración en la base de desarrollo: el cliente
SolarAndes, el inversor Genérico INV-200K en el catálogo (RF-08), los
materiales de las fórmulas f(L,A,B) con precio vigente (RF-09), y un
proyecto con terreno y equipo configurado (el panel de referencia y
ese inversor) — listo para generar el layout (RF-03) sin configurar
nada más. Se usa en la revisión de la semana 8.

Es idempotente: cada paso revisa primero si el dato ya existe (por su
clave natural: identificación del cliente, código del material, marca
y modelo del inversor, un terreno o un equipo por proyecto) y no lo
duplica ni le cambia el precio si ya lo tiene. Correrlo varias veces es
seguro.

Uso (desde la carpeta backend/, con el venv activado):
    python -m scripts.datos_demo

Requiere haber creado antes un Gerente General con:
    python -m scripts.crear_admin
"""

import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.orm import Session  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.data.paneles_referencia import PANELES_REFERENCIA  # noqa: E402
from app.models.cliente import Cliente, TipoIdentificacion  # noqa: E402
from app.models.inversor import Inversor  # noqa: E402
from app.models.material import Material  # noqa: E402
from app.models.perfil import Perfil  # noqa: E402
from app.models.proyecto import Proyecto  # noqa: E402
from app.models.usuario import Usuario  # noqa: E402
from app.schemas.equipo import ConfiguracionEquipoGuardar, Panel  # noqa: E402
from app.schemas.equipo import Inversor as InversorEquipoEsquema  # noqa: E402
from app.schemas.proyecto import ProyectoCrear  # noqa: E402
from app.schemas.terreno import TerrenoCrear  # noqa: E402
from app.services.equipo import guardar_configuracion, obtener_configuracion  # noqa: E402
from app.services.cotizacion import CODIGO_LOGISTICA  # noqa: E402
from app.services.material import actualizar_precio, crear_material  # noqa: E402
from app.services.proyecto import crear_proyecto  # noqa: E402
from app.services.terreno import crear_terreno, obtener_terreno  # noqa: E402

IDENTIFICACION_CLIENTE = "1091234567001"
NOMBRE_CLIENTE = "SolarAndes Instalaciones"
NOMBRE_PROYECTO = "Proyecto demo — Planta SolarAndes"

INVERSOR_DEMO = {
    "marca": "Genérico",
    "modelo": "INV-200K",
    "potencia_kw": 200,
    "vmax_v": 1100,
    "vmin_v": 200,
    "mppts": 10,
    "strings_por_mppt": 2,
}

# El panel de referencia más usado por los clientes de HEXtructure
# (app/data/paneles_referencia.py, el mismo que RF-05 usa por defecto
# cuando el proyecto todavía no tiene equipo configurado).
PANEL_REFERENCIA = PANELES_REFERENCIA[0]

# Código, nombre y precio de los materiales de las fórmulas f(L,A,B),
# más LOG (logística: cargo fijo, sin fórmula). El precio es solo para
# que la demo pueda cotizar de principio a fin — no es una lista de
# precios real.
MATERIALES_DEMO: list[tuple[str, str, Decimal]] = [
    ("VAR1650", "Varilla 1650", Decimal("2.50")),
    ("VAR1350", "Varilla 1350", Decimal("2.10")),
    ("HEX_V18MM", "Varilla HEX 18mm", Decimal("1.80")),
    ("SOP_A", "Soporte A", Decimal("3.20")),
    ("SOP_V", "Soporte V", Decimal("3.50")),
    ("SOP_V_E", "Soporte V extremo", Decimal("3.90")),
    ("ANT_B", "Antivuelco B", Decimal("4.10")),
    ("ANT_VAR", "Antivuelco varilla", Decimal("2.75")),
    ("CLAMP_F", "Abrazadera final", Decimal("1.15")),
    ("CLAMP_I", "Abrazadera intermedia", Decimal("0.95")),
    (CODIGO_LOGISTICA, "Logística", Decimal("150.00")),
]

# Terreno rectangular de 100 x 60 m: el mismo tamaño que usan las
# pruebas del layout, de sobra para una planta de demostración.
TERRENO_DEMO = [[0, 0], [100, 0], [100, 60], [0, 60]]


def _gerente_activo(db: Session) -> Usuario | None:
    return (
        db.query(Usuario)
        .join(Perfil, Perfil.id == Usuario.perfil_id)
        .filter(Perfil.acceso_total.is_(True), Usuario.activo.is_(True))
        .order_by(Usuario.id)
        .first()
    )


def _cliente_demo(db: Session) -> Cliente:
    cliente = db.query(Cliente).filter(Cliente.identificacion == IDENTIFICACION_CLIENTE).one_or_none()
    if cliente is not None:
        print(f"· Cliente {NOMBRE_CLIENTE} ya existía (id {cliente.id})")
        return cliente

    cliente = Cliente(
        nombre=NOMBRE_CLIENTE,
        tipo_identificacion=TipoIdentificacion.RUC,
        identificacion=IDENTIFICACION_CLIENTE,
        empresa=NOMBRE_CLIENTE,
        email="proyectos@solarandes.ec",
        telefono="099 123 4567",
        direccion="Ibarra, Imbabura",
    )
    db.add(cliente)
    db.commit()
    print(f"Listo: Cliente {NOMBRE_CLIENTE} creado (id {cliente.id})")
    return cliente


def _inversor_catalogo_demo(db: Session) -> None:
    existente = (
        db.query(Inversor)
        .filter(Inversor.marca == INVERSOR_DEMO["marca"], Inversor.modelo == INVERSOR_DEMO["modelo"])
        .one_or_none()
    )
    if existente is not None:
        print(f"· Inversor {INVERSOR_DEMO['marca']} {INVERSOR_DEMO['modelo']} ya estaba en el catálogo")
        return

    db.add(Inversor(**INVERSOR_DEMO))
    db.commit()
    print(f"Listo: Inversor {INVERSOR_DEMO['marca']} {INVERSOR_DEMO['modelo']} agregado al catálogo")


def _materiales_demo(db: Session) -> None:
    for codigo, nombre, precio in MATERIALES_DEMO:
        material = db.query(Material).filter(Material.codigo == codigo).one_or_none()
        if material is None:
            material = crear_material(db, codigo=codigo, nombre=nombre, unidad="unidad")
            print(f"Listo: Material {codigo} creado")

        precio_vigente = next((p for p in material.precios if p.vigente_hasta is None), None)
        if precio_vigente is not None:
            print(f"· Material {codigo} ya tenía precio vigente (${precio_vigente.precio})")
            continue

        actualizar_precio(db, material.id, precio)
        print(f"Listo: Precio de {codigo} fijado en ${precio}")


def _proyecto_demo(db: Session, cliente: Cliente, gerente: Usuario) -> Proyecto:
    proyecto = (
        db.query(Proyecto)
        .filter(Proyecto.cliente_id == cliente.id, Proyecto.nombre == NOMBRE_PROYECTO)
        .one_or_none()
    )
    if proyecto is not None:
        print(f"· Proyecto demo ya existía (id {proyecto.id})")
        return proyecto

    proyecto = crear_proyecto(
        db,
        ProyectoCrear(
            nombre=NOMBRE_PROYECTO,
            cliente_id=cliente.id,
            ubicacion="Imbabura, Ibarra — sector de prueba",
            latitud=0.3517,
            longitud=-78.1223,
        ),
        gerente,
    )
    print(f"Listo: Proyecto demo creado (id {proyecto.id})")
    return proyecto


def _terreno_demo(db: Session, proyecto: Proyecto) -> None:
    if obtener_terreno(db, proyecto.id) is not None:
        print("· El proyecto demo ya tenía terreno")
        return

    crear_terreno(db, proyecto, TerrenoCrear(vertices=TERRENO_DEMO, orientacion_norte=0, caminos=[]))
    print("Listo: Terreno de 100 x 60 m creado")


def _equipo_demo(db: Session, proyecto: Proyecto) -> None:
    if obtener_configuracion(db, proyecto.id) is not None:
        print("· El proyecto demo ya tenía equipo configurado")
        return

    guardar_configuracion(
        db,
        proyecto,
        ConfiguracionEquipoGuardar(
            panel=Panel(
                marca=PANEL_REFERENCIA["marca"],
                modelo=PANEL_REFERENCIA["modelo"],
                potencia_wp=PANEL_REFERENCIA["potencia_wp"],
                largo_mm=PANEL_REFERENCIA["largo_mm"],
                ancho_mm=PANEL_REFERENCIA["ancho_mm"],
                voc_v=PANEL_REFERENCIA["voc_v"],
                vmp_v=PANEL_REFERENCIA["vmp_v"],
            ),
            angulo_montaje=15,
            inversores=[InversorEquipoEsquema(**INVERSOR_DEMO)],
        ),
    )
    print(f"Listo: Equipo configurado con el panel {PANEL_REFERENCIA['modelo']} y el inversor {INVERSOR_DEMO['modelo']}")


def main() -> int:
    # Guarda contra el error más caro: sembrar datos falsos en producción.
    if settings.ENVIRONMENT == "production":
        print("Error: ENVIRONMENT=production. Este script solo corre en desarrollo.")
        return 1

    db = SessionLocal()
    try:
        gerente = _gerente_activo(db)
        if gerente is None:
            print("Error: No hay un Gerente General activo.")
            print("  Créalo primero con:  python -m scripts.crear_admin")
            return 1

        cliente = _cliente_demo(db)
        _inversor_catalogo_demo(db)
        _materiales_demo(db)
        proyecto = _proyecto_demo(db, cliente, gerente)
        _terreno_demo(db, proyecto)
        _equipo_demo(db, proyecto)

        print(f"\nAbre el proyecto en:  /proyectos/{proyecto.id}")
        print(f"Ya tiene terreno y equipo — genera el layout en:  /generar/{proyecto.id}/layout")
        return 0

    except Exception as exc:
        db.rollback()
        print(f"Error: Error al sembrar los datos: {exc}")
        return 1

    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
