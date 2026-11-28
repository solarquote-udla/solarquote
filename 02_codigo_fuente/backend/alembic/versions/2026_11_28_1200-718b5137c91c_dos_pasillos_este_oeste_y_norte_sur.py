"""Dos pasillos: este-oeste y norte-sur

Pedido de Joseph (28 de noviembre de 2026): el pasillo entre franjas de
bloques (este-oeste) y el que separa los bloques de una misma franja
(norte-sur) no siempre miden lo mismo en obra. `layouts.pasillo_m` se
reemplaza por `pasillo_este_oeste_m` y `pasillo_norte_sur_m`; los
layouts que ya existen quedan con el mismo valor en los dos, igual que
estaban generados.

Revision ID: 718b5137c91c
Revises: a4c7d1f29e83
Create Date: 2026-11-28 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "718b5137c91c"
down_revision: str | None = "a4c7d1f29e83"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Aplica los cambios."""
    op.add_column("layouts", sa.Column("pasillo_este_oeste_m", sa.Float(), nullable=True))
    op.add_column("layouts", sa.Column("pasillo_norte_sur_m", sa.Float(), nullable=True))
    op.execute("UPDATE layouts SET pasillo_este_oeste_m = pasillo_m, pasillo_norte_sur_m = pasillo_m")
    op.alter_column("layouts", "pasillo_este_oeste_m", nullable=False)
    op.alter_column("layouts", "pasillo_norte_sur_m", nullable=False)
    op.drop_column("layouts", "pasillo_m")


def downgrade() -> None:
    """Revierte los cambios."""
    op.add_column("layouts", sa.Column("pasillo_m", sa.Float(), nullable=True))
    op.execute("UPDATE layouts SET pasillo_m = pasillo_este_oeste_m")
    op.alter_column("layouts", "pasillo_m", nullable=False)
    op.drop_column("layouts", "pasillo_norte_sur_m")
    op.drop_column("layouts", "pasillo_este_oeste_m")
