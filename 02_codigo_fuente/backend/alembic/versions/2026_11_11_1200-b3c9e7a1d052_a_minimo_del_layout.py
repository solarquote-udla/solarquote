"""A mínimo del layout (SQ-170)

`layouts.paneles_ancho_minimo`: el A mínimo con el que se generó el
layout. Los bloques cortos con menos paneles en A no se generan. Los
layouts que ya existen quedan con 1, que es como se generaban antes
(sin mínimo).

Revision ID: b3c9e7a1d052
Revises: 710d46c09d78
Create Date: 2026-11-11 12:00:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'b3c9e7a1d052'
down_revision: str | None = '710d46c09d78'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Aplica los cambios."""
    op.add_column(
        'layouts',
        sa.Column('paneles_ancho_minimo', sa.Integer(), server_default='1', nullable=False),
    )


def downgrade() -> None:
    """Revierte los cambios."""
    op.drop_column('layouts', 'paneles_ancho_minimo')
