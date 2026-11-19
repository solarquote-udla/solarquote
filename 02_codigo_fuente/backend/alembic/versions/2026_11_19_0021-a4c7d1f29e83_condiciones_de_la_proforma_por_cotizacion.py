"""condiciones de la proforma editables por cotizacion (SQ-213)

Revision ID: a4c7d1f29e83
Revises: e7b2a9c41d06
Create Date: 2026-11-19 00:21:00.000000

Acuerdo de la reunion con Santi: plazo de entrega, validez de la oferta,
garantia y forma de pago dejan de ser fijos en `settings` para todas
las cotizaciones -- cada una puede pisarlos al confirmarse. Se agrega
tambien el precio por Wp, informativo (no participa del calculo).

Todas nullable: las cotizaciones de antes de este campo no tienen como
reconstruirlo retroactivamente (ver el mismo criterio en subtotal/iva).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a4c7d1f29e83"
down_revision: str | None = "e7b2a9c41d06"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("cotizaciones", sa.Column("plazo_dias", sa.Integer(), nullable=True))
    op.add_column("cotizaciones", sa.Column("validez_dias", sa.Integer(), nullable=True))
    op.add_column("cotizaciones", sa.Column("garantia_anios", sa.Integer(), nullable=True))
    op.add_column("cotizaciones", sa.Column("pago_anticipo_pct", sa.Numeric(5, 2), nullable=True))
    op.add_column("cotizaciones", sa.Column("pago_entrega_pct", sa.Numeric(5, 2), nullable=True))
    op.add_column("cotizaciones", sa.Column("pago_60_dias_pct", sa.Numeric(5, 2), nullable=True))
    op.add_column("cotizaciones", sa.Column("precio_wp", sa.Numeric(10, 4), nullable=True))


def downgrade() -> None:
    op.drop_column("cotizaciones", "precio_wp")
    op.drop_column("cotizaciones", "pago_60_dias_pct")
    op.drop_column("cotizaciones", "pago_entrega_pct")
    op.drop_column("cotizaciones", "pago_anticipo_pct")
    op.drop_column("cotizaciones", "garantia_anios")
    op.drop_column("cotizaciones", "validez_dias")
    op.drop_column("cotizaciones", "plazo_dias")
