"""confirmación del layout y cotización desde el layout (RF-05)

  1. `cotizaciones.potencia_kwp` y `cotizaciones.total_paneles`: el
     tamaño de la planta cotizada, que el tablero (RF-13) suma. Nulos en
     las cotizaciones anteriores y en las cotizadas al vuelo.
  2. `bloques_layout.inversor >= 0`: revisión del PR #38.

Revision ID: e1f4b3a9c207
Revises: c3a8d61f04b2
Create Date: 2026-10-18 12:00:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'e1f4b3a9c207'
down_revision: str | None = 'c3a8d61f04b2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Aplica los cambios."""
    op.add_column('cotizaciones', sa.Column('potencia_kwp', sa.Numeric(precision=12, scale=2), nullable=True))
    op.add_column('cotizaciones', sa.Column('total_paneles', sa.Integer(), nullable=True))
    op.create_check_constraint('ck_bloques_layout_inversor_no_negativo', 'bloques_layout', 'inversor >= 0')


def downgrade() -> None:
    """Revierte los cambios."""
    op.drop_constraint('ck_bloques_layout_inversor_no_negativo', 'bloques_layout', type_='check')
    op.drop_column('cotizaciones', 'total_paneles')
    op.drop_column('cotizaciones', 'potencia_kwp')
