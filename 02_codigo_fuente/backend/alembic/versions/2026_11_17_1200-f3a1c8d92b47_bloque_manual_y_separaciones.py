"""Bloque con A manual y separación entre paneles

Revisión con HEXtructure del 17 de noviembre de 2026:

- `layouts.paneles_ancho`: el A del bloque que elige el Gerente. Null =
  bloque compacto (A = 3 · L), que es como se generaban antes.
- `layouts.separacion_paneles_largo_m` y `separacion_paneles_ancho_m`:
  separación entre paneles dentro del bloque (6 cm y 2 cm en los layouts
  nuevos). Los layouts que ya existen se generaron sin separación: quedan
  en 0.

Revision ID: f3a1c8d92b47
Revises: 5e2a2b0baecf
Create Date: 2026-11-17 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f3a1c8d92b47"
down_revision: str | None = "5e2a2b0baecf"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Aplica los cambios."""
    op.add_column("layouts", sa.Column("paneles_ancho", sa.Integer(), nullable=True))
    op.add_column(
        "layouts",
        sa.Column("separacion_paneles_largo_m", sa.Float(), server_default="0", nullable=False),
    )
    op.add_column(
        "layouts",
        sa.Column("separacion_paneles_ancho_m", sa.Float(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    """Revierte los cambios."""
    op.drop_column("layouts", "separacion_paneles_ancho_m")
    op.drop_column("layouts", "separacion_paneles_largo_m")
    op.drop_column("layouts", "paneles_ancho")
