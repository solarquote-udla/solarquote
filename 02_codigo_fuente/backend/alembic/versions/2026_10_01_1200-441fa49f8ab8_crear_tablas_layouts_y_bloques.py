"""crear tablas layouts y bloques_layout

Revision ID: 441fa49f8ab8
Revises: b7d2e5f18c40
Create Date: 2026-10-01 12:00:00.000000

Módulo 1 (RF-03). Un layout por proyecto con sus bloques. Ver el
docstring de app/models/layout.py para el diseño.

Sin tipos ENUM, así que el downgrade no necesita limpieza adicional.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '441fa49f8ab8'
down_revision: str | None = 'b7d2e5f18c40'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Aplica los cambios."""
    op.create_table(
        'layouts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('proyecto_id', sa.Integer(), nullable=False),
        # Parámetros
        sa.Column('paneles_largo', sa.Integer(), nullable=False),
        sa.Column('pasillo_m', sa.Float(), nullable=False),
        sa.Column('tolerancia_proporcion', sa.Float(), nullable=False),
        sa.Column('capacidad_deseada_kwp', sa.Float(), nullable=True),
        # Resultados
        sa.Column('total_paneles', sa.Integer(), nullable=False),
        sa.Column('potencia_kwp', sa.Float(), nullable=False),
        sa.Column('resumen', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('huella', sa.String(length=64), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ['proyecto_id'], ['proyectos.id'],
            name='fk_layouts_proyecto_id_proyectos',
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_layouts_proyecto_id'), 'layouts', ['proyecto_id'], unique=True
    )

    op.create_table(
        'bloques_layout',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('layout_id', sa.Integer(), nullable=False),
        sa.Column('orden', sa.Integer(), nullable=False),
        sa.Column('vertices', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('paneles_largo', sa.Integer(), nullable=False),
        sa.Column('paneles_ancho', sa.Integer(), nullable=False),
        sa.Column('proporcion', sa.Float(), nullable=False),
        sa.Column('en_proporcion', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ['layout_id'], ['layouts.id'],
            name='fk_bloques_layout_layout_id_layouts',
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_bloques_layout_layout_id'), 'bloques_layout', ['layout_id'], unique=False
    )


def downgrade() -> None:
    """Revierte los cambios."""
    op.drop_index(op.f('ix_bloques_layout_layout_id'), table_name='bloques_layout')
    op.drop_table('bloques_layout')
    op.drop_index(op.f('ix_layouts_proyecto_id'), table_name='layouts')
    op.drop_table('layouts')
