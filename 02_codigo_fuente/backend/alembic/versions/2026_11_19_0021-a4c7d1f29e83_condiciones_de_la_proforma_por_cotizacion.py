"""condiciones de la proforma editables por cotizacion (SQ-213)

Revision ID: a4c7d1f29e83
Revises: e7b2a9c41d06
Create Date: 2026-11-19 00:21:00.000000

Acuerdo de la reunion con Santi: plazo de entrega, validez de la oferta
y garantia dejan de ser fijos en `settings` para todas las cotizaciones
-- cada una puede pisarlos al confirmarse. La forma de pago pasa a ser
una lista de tramos (nombre y porcentaje), no un numero fijo de campos
(tramos_pago_cotizacion): las proformas reales varian en cuantos tramos
tienen. Se agrega tambien el precio por Wp, calculado (no editable).

Las columnas de Cotizacion son nullable: las cotizaciones de antes de
este campo no tienen como reconstruirlo retroactivamente (ver el mismo
criterio en subtotal/iva).
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
    op.add_column("cotizaciones", sa.Column("precio_wp", sa.Numeric(10, 4), nullable=True))

    op.create_table(
        "tramos_pago_cotizacion",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("cotizacion_id", sa.Integer(), nullable=False),
        sa.Column("orden", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(length=100), nullable=False),
        sa.Column("porcentaje", sa.Numeric(5, 2), nullable=False),
        sa.ForeignKeyConstraint(["cotizacion_id"], ["cotizaciones.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_tramos_pago_cotizacion_cotizacion_id"),
        "tramos_pago_cotizacion",
        ["cotizacion_id"],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_tramos_pago_cotizacion_cotizacion_id"), table_name="tramos_pago_cotizacion")
    op.drop_table("tramos_pago_cotizacion")

    op.drop_column("cotizaciones", "precio_wp")
    op.drop_column("cotizaciones", "garantia_anios")
    op.drop_column("cotizaciones", "validez_dias")
    op.drop_column("cotizaciones", "plazo_dias")
