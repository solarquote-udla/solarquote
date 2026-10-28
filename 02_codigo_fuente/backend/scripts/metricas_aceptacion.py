"""
Métricas de la prueba de aceptación, leídas de la base — sección 7.4.

Complementa a `ia-service/scripts/evaluar_ia.py`: aquel mide la IA contra
la respuesta correcta; este mide lo que pasó cuando el Gerente General y
el Personal de Producción usaron el sistema en la sesión de aceptación:

- Bocetos: cuántos se confirmaron sin corregir nada y cuántas
  correcciones manuales hizo falta en los demás.
- Tiempo de cotización: desde que se crea el proyecto hasta que se emite
  la proforma (incluye las pausas de la sesión, así que es una cota
  superior; el tiempo neto se toma con cronómetro, ver el protocolo).
- Conteo de varillas: la sugerencia de la IA frente a la cantidad que el
  operario confirmó al despachar.
- Validación: despachos con justificación y recepciones con diferencias.

Solo lee: no modifica nada. Uso (desde backend/, con el venv activado):

    python -m scripts.metricas_aceptacion --desde 2026-12-07 [--hasta 2026-12-11]
"""

from __future__ import annotations

import argparse
import statistics
import sys
from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import func, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.models.boceto import Boceto  # noqa: E402
from app.models.cotizacion import Cotizacion  # noqa: E402
from app.models.proyecto import Proyecto  # noqa: E402
from app.models.validacion import Despacho, ItemDespacho, ItemRecepcion, Recepcion  # noqa: E402

LINEA_BASE_MINUTOS = 45  # tiempo actual por cotización, según la entrevista con HEXtructure (sección 1.1)


@dataclass
class FilaBoceto:
    metodo: str
    ediciones_manuales: int
    cotizado: bool


@dataclass
class FilaConteo:
    conteo_ia: int
    confirmado: int


@dataclass
class Datos:
    bocetos: list[FilaBoceto]
    minutos_por_cotizacion: list[float]
    conteos: list[FilaConteo]
    despachos: int
    despachos_con_justificacion: int
    recepciones: int
    recepciones_con_diferencias: int


def _rango(desde: date | None, hasta: date | None) -> tuple[datetime, datetime]:
    inicio = datetime.combine(desde or date(2000, 1, 1), time.min, tzinfo=timezone.utc)
    fin = datetime.combine(hasta or date(2100, 1, 1), time.max, tzinfo=timezone.utc)
    return inicio, fin


def recolectar(db: Session, desde: date | None = None, hasta: date | None = None) -> Datos:
    inicio, fin = _rango(desde, hasta)

    primera_cotizacion = (
        select(Cotizacion.proyecto_id, func.min(Cotizacion.created_at).label("emitida"))
        .where(Cotizacion.proyecto_id.is_not(None))
        .group_by(Cotizacion.proyecto_id)
        .subquery()
    )

    bocetos = [
        FilaBoceto(metodo=metodo, ediciones_manuales=ediciones, cotizado=emitida is not None)
        for metodo, ediciones, emitida in db.execute(
            select(Boceto.metodo, Boceto.ediciones_manuales, primera_cotizacion.c.emitida)
            .outerjoin(primera_cotizacion, primera_cotizacion.c.proyecto_id == Boceto.proyecto_id)
            .where(Boceto.created_at.between(inicio, fin))
        )
    ]

    minutos = [
        (emitida - creado).total_seconds() / 60
        for creado, emitida in db.execute(
            select(Proyecto.created_at, primera_cotizacion.c.emitida)
            .join(primera_cotizacion, primera_cotizacion.c.proyecto_id == Proyecto.id)
            .where(Proyecto.created_at.between(inicio, fin))
        )
    ]

    conteos = [
        FilaConteo(conteo_ia=ia, confirmado=confirmado)
        for ia, confirmado in db.execute(
            select(ItemDespacho.conteo_ia, ItemDespacho.cantidad_despachada)
            .join(Despacho, Despacho.id == ItemDespacho.despacho_id)
            .where(ItemDespacho.conteo_ia.is_not(None), Despacho.created_at.between(inicio, fin))
        )
    ]

    despachos = db.execute(
        select(func.count(), func.count(Despacho.justificacion)).where(Despacho.created_at.between(inicio, fin))
    ).one()
    recepciones = db.scalar(select(func.count()).select_from(Recepcion).where(Recepcion.created_at.between(inicio, fin)))
    con_diferencias = db.scalar(
        select(func.count(func.distinct(ItemRecepcion.recepcion_id)))
        .join(Recepcion, Recepcion.id == ItemRecepcion.recepcion_id)
        .where(ItemRecepcion.estado == "diferencia", Recepcion.created_at.between(inicio, fin))
    )

    return Datos(
        bocetos=bocetos,
        minutos_por_cotizacion=minutos,
        conteos=conteos,
        despachos=despachos[0],
        despachos_con_justificacion=despachos[1],
        recepciones=recepciones or 0,
        recepciones_con_diferencias=con_diferencias or 0,
    )


def calcular(datos: Datos) -> dict:
    confirmados = [b for b in datos.bocetos if b.cotizado]
    con_ia = [b for b in confirmados if b.metodo == "ia"]
    minutos = datos.minutos_por_cotizacion
    errores = [abs(c.conteo_ia - c.confirmado) for c in datos.conteos]
    return {
        "bocetos_cargados": len(datos.bocetos),
        "bocetos_confirmados": len(confirmados),
        "bocetos_ia_confirmados": len(con_ia),
        "bocetos_sin_correcciones": (
            sum(b.ediciones_manuales == 0 for b in confirmados) / len(confirmados) if confirmados else None
        ),
        "correcciones_medias": statistics.mean(b.ediciones_manuales for b in confirmados) if confirmados else None,
        "cotizaciones": len(minutos),
        "minutos_mediana": statistics.median(minutos) if minutos else None,
        "minutos_maximo": max(minutos) if minutos else None,
        "ahorro_frente_a_linea_base": (
            1 - statistics.median(minutos) / LINEA_BASE_MINUTOS if minutos else None
        ),
        "conteos": len(datos.conteos),
        "conteos_aceptados_sin_cambio": sum(e == 0 for e in errores) / len(errores) if errores else None,
        "conteo_error_medio": statistics.mean(errores) if errores else None,
        "despachos": datos.despachos,
        "despachos_con_justificacion": datos.despachos_con_justificacion,
        "recepciones": datos.recepciones,
        "recepciones_con_diferencias": datos.recepciones_con_diferencias,
    }


def _pct(valor: float | None) -> str:
    return "sin datos" if valor is None else f"{valor * 100:.1f} %"


def _num(valor: float | None, unidad: str = "") -> str:
    return "sin datos" if valor is None else f"{valor:.1f}{unidad}"


def informe(m: dict) -> str:
    return "\n".join(
        [
            "Bocetos",
            f"  Cargados / confirmados (con cotización):   {m['bocetos_cargados']} / {m['bocetos_confirmados']}"
            f" ({m['bocetos_ia_confirmados']} leídos con IA)",
            f"  Confirmados sin ninguna corrección:        {_pct(m['bocetos_sin_correcciones'])}",
            f"  Correcciones manuales por boceto (media):  {_num(m['correcciones_medias'])}",
            "Tiempo de cotización (proyecto creado -> proforma emitida)",
            f"  Cotizaciones:                              {m['cotizaciones']}",
            f"  Mediana / máximo:                          {_num(m['minutos_mediana'], ' min')} / {_num(m['minutos_maximo'], ' min')}",
            f"  Ahorro frente a {LINEA_BASE_MINUTOS} min del proceso manual:  {_pct(m['ahorro_frente_a_linea_base'])}",
            "Conteo de varillas (sugerencia de la IA vs. cantidad confirmada)",
            f"  Materiales contados con IA:                {m['conteos']}",
            f"  Aceptados sin cambio:                      {_pct(m['conteos_aceptados_sin_cambio'])}",
            f"  Diferencia media:                          {_num(m['conteo_error_medio'], ' varillas')}",
            "Validación de materiales",
            f"  Despachos (con justificación):             {m['despachos']} ({m['despachos_con_justificacion']})",
            f"  Recepciones (con diferencias):             {m['recepciones']} ({m['recepciones_con_diferencias']})",
        ]
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Métricas de la sesión de aceptación (solo lectura).")
    parser.add_argument("--desde", type=date.fromisoformat, help="Fecha inicial, AAAA-MM-DD (incluida).")
    parser.add_argument("--hasta", type=date.fromisoformat, help="Fecha final, AAAA-MM-DD (incluida).")
    args = parser.parse_args(argv)
    if args.desde and args.hasta and args.hasta < args.desde:
        parser.error("--hasta no puede ser anterior a --desde.")

    with SessionLocal() as db:
        print(informe(calcular(recolectar(db, args.desde, args.hasta))))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
