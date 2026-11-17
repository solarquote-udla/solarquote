"""catalogo de paneles e inversores segun Produccion

Revision ID: e7b2a9c41d06
Revises: d4f1a8c3e567
Create Date: 2026-11-16 18:00:00.000000

Indicaciones de Produccion (demo del 16 de noviembre): en plantas sobre
suelo hoy se venden paneles de mas de 600 W de LONGi, Jinko, JA Solar y
Canadian Solar, y se montan inversores Huawei de 100 kW, 330 kW y el
nuevo de unos 500 kW.

- Agrega esos paneles e inversores si no existen (marca y modelo).
- Desactiva (baja logica) los paneles que no entran en esa lista: los de
  580 W y los de Risen Energy. Siguen en la base y se pueden reactivar
  desde Configuracion, Paneles.

Datos de las fichas tecnicas de cada fabricante (STC). Se pueden
corregir desde las pantallas de Configuracion sin tocar el codigo.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e7b2a9c41d06"
down_revision: str | None = "d4f1a8c3e567"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (marca, modelo, potencia_wp, largo_mm, ancho_mm, voc_v, vmp_v)
PANELES_NUEVOS = [
    ("LONGi", "Hi-MO X10 LR7-72HVH-650M", 650, 2382, 1134, 53.9, 44.56),
    ("LONGi", "Hi-MO X10 LR7-72HVH-670M", 670, 2382, 1134, 54.3, 44.96),
    ("JA Solar", "DeepBlue 4.0 Pro JAM66D45-620/LB", 620, 2382, 1134, 48.5, 40.21),
    ("JA Solar", "DeepBlue 4.0 Pro JAM66D45-625/LB", 625, 2382, 1134, 48.7, 40.45),
    ("Jinko Solar", "Tiger Neo 3.0 JKM650N-66QL6-BDV", 650, 2382, 1134, 50.26, 42.57),
    ("Canadian Solar", "TOPBiHiKu7 CS7N-720TB-AG", 720, 2384, 1303, 48.7, 40.8),
]

# Ya estaban en el catalogo inicial y no se usan en planta sobre suelo
PANELES_A_DESACTIVAR = [
    ("Jinko Solar", "Tiger Neo JKM580N-72HL4-V"),
    ("Canadian Solar", "TOPBiHiKu6 CS6W-580TB-AG"),
    ("Risen Energy", "RSM144-9-580BNDG"),
    ("Risen Energy", "Hyper-ion RSM132-8-710BHDG"),
]

# (marca, modelo, potencia_kw nominal, vmax_v, vmin_v MPPT, mppts, strings_por_mppt)
# 330KTL-H1: 300 kW nominal (330 kVA maximos); entradas por MPPT 4/5/5/4/5/5,
# se toma 4 para no sobrestimar la capacidad de strings.
# 506KTL-H1: 460 kW nominal (506 kVA maximos).
INVERSORES_NUEVOS = [
    ("Huawei", "SUN2000-100KTL-M2", 100, 1100, 200, 10, 2),
    ("Huawei", "SUN2000-330KTL-H1", 300, 1500, 500, 6, 4),
    ("Huawei", "SUN2000-506KTL-H1", 460, 1500, 500, 6, 6),
]


def upgrade() -> None:
    bind = op.get_bind()
    for marca, modelo, potencia, largo, ancho, voc, vmp in PANELES_NUEVOS:
        bind.execute(
            sa.text(
                "INSERT INTO paneles (marca, modelo, potencia_wp, largo_mm, ancho_mm, voc_v, vmp_v, activo) "
                "SELECT :marca, :modelo, :potencia, :largo, :ancho, :voc, :vmp, true "
                "WHERE NOT EXISTS (SELECT 1 FROM paneles WHERE marca = :marca AND modelo = :modelo)"
            ),
            {"marca": marca, "modelo": modelo, "potencia": potencia, "largo": largo, "ancho": ancho, "voc": voc, "vmp": vmp},
        )
    for marca, modelo in PANELES_A_DESACTIVAR:
        bind.execute(
            sa.text("UPDATE paneles SET activo = false WHERE marca = :marca AND modelo = :modelo"),
            {"marca": marca, "modelo": modelo},
        )
    for marca, modelo, potencia, vmax, vmin, mppts, strings in INVERSORES_NUEVOS:
        bind.execute(
            sa.text(
                "INSERT INTO inversores (marca, modelo, potencia_kw, vmax_v, vmin_v, mppts, strings_por_mppt, activo) "
                "SELECT :marca, :modelo, :potencia, :vmax, :vmin, :mppts, :strings, true "
                "WHERE NOT EXISTS (SELECT 1 FROM inversores WHERE marca = :marca AND modelo = :modelo)"
            ),
            {"marca": marca, "modelo": modelo, "potencia": potencia, "vmax": vmax, "vmin": vmin, "mppts": mppts, "strings": strings},
        )


def downgrade() -> None:
    bind = op.get_bind()
    for marca, modelo, *_ in PANELES_NUEVOS:
        bind.execute(
            sa.text("DELETE FROM paneles WHERE marca = :marca AND modelo = :modelo"),
            {"marca": marca, "modelo": modelo},
        )
    for marca, modelo in PANELES_A_DESACTIVAR:
        bind.execute(
            sa.text("UPDATE paneles SET activo = true WHERE marca = :marca AND modelo = :modelo"),
            {"marca": marca, "modelo": modelo},
        )
    for marca, modelo, *_ in INVERSORES_NUEVOS:
        bind.execute(
            sa.text("DELETE FROM inversores WHERE marca = :marca AND modelo = :modelo"),
            {"marca": marca, "modelo": modelo},
        )
