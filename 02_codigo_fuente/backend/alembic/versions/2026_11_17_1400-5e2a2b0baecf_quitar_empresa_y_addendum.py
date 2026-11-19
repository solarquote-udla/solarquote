"""quitar empresa de clientes y el addendum de cotizaciones

Pedido de Santi en la reunion del 17 de noviembre (ver acta/ERS de
Joseph): el catalogo de clientes no necesita "Empresa", y la proforma de
HEXtructure no tiene addendum (mermas de instalacion) — es subtotal, IVA
y total.

El downgrade restaura las columnas vacias/en 0: el dato de empresa y el
porcentaje de addendum de las cotizaciones ya emitidas se pierde, no hay
forma de reconstruirlo.

Revision ID: 5e2a2b0baecf
Revises: e7b2a9c41d06
Create Date: 2026-11-17 14:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "5e2a2b0baecf"
down_revision: str | None = "e7b2a9c41d06"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("clientes", "empresa")
    op.drop_column("cotizaciones", "cliente_empresa")
    op.drop_column("cotizaciones", "addendum_monto")
    op.drop_column("cotizaciones", "addendum_porcentaje")


def downgrade() -> None:
    op.add_column(
        "cotizaciones",
        sa.Column("addendum_porcentaje", sa.Numeric(5, 2), server_default="0", nullable=False),
    )
    op.add_column("cotizaciones", sa.Column("addendum_monto", sa.Numeric(12, 2), nullable=True))
    op.add_column("cotizaciones", sa.Column("cliente_empresa", sa.String(length=150), nullable=True))
    op.add_column("clientes", sa.Column("empresa", sa.String(length=150), nullable=True))
