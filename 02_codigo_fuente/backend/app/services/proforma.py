"""
Numeración de las proformas — RF-07.

Formato PREFIJO-NNN-AAAA, como en el prototipo (CT-130-2026): correlativo
por año, con el año de Ecuador. `PROFORMA_PRIMER_NUMERO` permite
continuar la numeración que HEXtructure ya lleva a mano.
"""

import re
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.fechas import ZONA_ECUADOR
from app.models.cotizacion import Cotizacion

# Clave del candado de Postgres que serializa la numeración.
_CANDADO_PROFORMA = 7_301_130


def siguiente_numero_proforma(db: Session, anio: int | None = None) -> str:
    """
    Próximo número de proforma del año: el mayor usado más uno, o
    PROFORMA_PRIMER_NUMERO si todavía no hay ninguno.

    Toma un candado de la transacción (`pg_advisory_xact_lock`) para que
    dos emisiones simultáneas no tomen el mismo número. Se libera solo
    con el commit o el rollback de quien emite la cotización.
    """
    # Año de Ecuador: el 31 de diciembre a las 21:00 aún es el año que termina
    anio = anio or datetime.now(ZONA_ECUADOR).year
    prefijo = settings.PROFORMA_PREFIJO
    db.execute(text("SELECT pg_advisory_xact_lock(:clave)"), {"clave": _CANDADO_PROFORMA})

    patron = re.compile(rf"^{re.escape(prefijo)}-(\d+)-{anio}$")
    usados = [
        int(m.group(1))
        for (numero,) in db.query(Cotizacion.numero_proforma)
        .filter(Cotizacion.numero_proforma.like(f"{prefijo}-%-{anio}"))
        .all()
        if numero and (m := patron.match(numero))
    ]
    siguiente = max(usados, default=settings.PROFORMA_PRIMER_NUMERO - 1) + 1
    return f"{prefijo}-{siguiente:03d}-{anio}"
