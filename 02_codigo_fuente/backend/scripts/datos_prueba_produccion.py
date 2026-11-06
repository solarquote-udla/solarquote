"""
Identifica clientes y proyectos de prueba que pueden haber quedado en
producción — solo lectura, no borra ni modifica nada.

Antes de la aceptación con HEXtructure conviene revisar qué datos de
prueba (de la demo, de validar el despliegue, etc.) quedaron en la base
real, para decidir qué hacer con ellos — ver la propuesta en
04_despliegue_ci_cd/guias/DATOS-DE-PRUEBA.md.

El filtro es deliberadamente simple y conservador: nombre o
identificación del cliente, o nombre del proyecto, que contengan alguna
de las palabras de PATRONES (sin distinguir mayúsculas/minúsculas). Un
patrón así puede dar falsos positivos (un cliente real que se llame
"Pruebas Hidalgo S.A.", por ejemplo) — por eso el script solo informa,
nunca decide: cada fila hay que revisarla a mano antes de dar de baja a
nadie.

Uso (contra la base que se quiera revisar — producción, development...):
    DATABASE_URL=<la base a revisar> python -m scripts.datos_prueba_produccion
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import func  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.models.cliente import Cliente  # noqa: E402
from app.models.cotizacion import Cotizacion  # noqa: E402
from app.models.proyecto import Proyecto  # noqa: E402
from app.models.validacion import Despacho, Recepcion  # noqa: E402

# Palabras que sugieren un dato de prueba, no un cliente o proyecto real.
# "solarandes" es, a propósito, el cliente que siembra scripts/datos_demo.py.
PATRONES = ["prueba", "test", "demo", "solarandes", "ejemplo"]


def _coincide(*valores: str | None) -> bool:
    texto = " ".join(v for v in valores if v).lower()
    return any(patron in texto for patron in PATRONES)


def _clientes_de_prueba(db: Session) -> list[Cliente]:
    return [c for c in db.query(Cliente).all() if _coincide(c.nombre, c.identificacion, c.empresa)]


def _proyectos_de_prueba(db: Session, ids_clientes_de_prueba: set[int]) -> list[Proyecto]:
    """Proyectos de un cliente ya marcado, o cuyo propio nombre coincide
    (un proyecto de prueba colgado de un cliente real, por ejemplo)."""
    return [
        p
        for p in db.query(Proyecto).all()
        if p.cliente_id in ids_clientes_de_prueba or _coincide(p.nombre)
    ]


def _impacto_cliente(db: Session, cliente_id: int) -> dict[str, int]:
    proyectos = db.query(func.count(Proyecto.id)).filter(Proyecto.cliente_id == cliente_id).scalar()
    cotizaciones = db.query(func.count(Cotizacion.id)).filter(Cotizacion.cliente_id == cliente_id).scalar()
    return {"proyectos": proyectos, "cotizaciones": cotizaciones}


def _impacto_proyecto(db: Session, proyecto_id: int) -> dict[str, int]:
    cotizaciones_ids = [
        cid
        for (cid,) in db.query(Cotizacion.id).filter(Cotizacion.proyecto_id == proyecto_id).all()
    ]
    despachos = (
        db.query(func.count(Despacho.id)).filter(Despacho.cotizacion_id.in_(cotizaciones_ids)).scalar()
        if cotizaciones_ids
        else 0
    )
    recepciones = (
        db.query(func.count(Recepcion.id)).filter(Recepcion.cotizacion_id.in_(cotizaciones_ids)).scalar()
        if cotizaciones_ids
        else 0
    )
    return {"cotizaciones": len(cotizaciones_ids), "despachos": despachos, "recepciones": recepciones}


def main() -> int:
    db = SessionLocal()
    try:
        clientes = _clientes_de_prueba(db)
        ids_clientes = {c.id for c in clientes}
        proyectos = _proyectos_de_prueba(db, ids_clientes)

        print(f"Clientes que coinciden con un patrón de prueba ({', '.join(PATRONES)}):\n")
        if not clientes:
            print("  Ninguno.")
        for c in clientes:
            impacto = _impacto_cliente(db, c.id)
            print(
                f"  [{c.id}] {c.nombre} ({c.identificacion}) — activo={c.activo} — "
                f"creado {c.created_at:%Y-%m-%d} — "
                f"{impacto['proyectos']} proyecto(s), {impacto['cotizaciones']} cotización(es)"
            )

        print(f"\nProyectos que coinciden (de esos clientes, o por su propio nombre):\n")
        if not proyectos:
            print("  Ninguno.")
        for p in proyectos:
            impacto = _impacto_proyecto(db, p.id)
            motivo = "cliente de prueba" if p.cliente_id in ids_clientes else "nombre del proyecto"
            print(
                f"  [{p.id}] {p.nombre} (cliente {p.cliente_id}, por: {motivo}) — estado={p.estado.value} — "
                f"{impacto['cotizaciones']} cotización(es), {impacto['despachos']} despacho(s), "
                f"{impacto['recepciones']} recepción(es)"
            )

        print(
            "\nEsto es solo un reporte: no se dio de baja ni se borró nada. "
            "Ver la propuesta en 04_despliegue_ci_cd/guias/DATOS-DE-PRUEBA.md antes de actuar."
        )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
