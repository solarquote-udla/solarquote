"""fusionar heads de layout y desglose de cotizaciones

Revision ID: 26f2e122b07e
Revises: 441fa49f8ab8, 682c93cc4b63
Create Date: 2026-10-05 17:57:09.986556
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '26f2e122b07e'
down_revision: str | None = ('441fa49f8ab8', '682c93cc4b63')
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Aplica los cambios."""
    pass


def downgrade() -> None:
    """Revierte los cambios."""
    pass
