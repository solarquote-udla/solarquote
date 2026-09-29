"""crear tabla configuraciones_equipo

Revision ID: b7d2e5f18c40
Revises: a4e1c7b90d32
Create Date: 2026-09-29 12:00:00.000000

Módulo 1 (RF-02). Panel e inversor por proyecto, relación uno a uno.
Los valores se guardan en la tabla y no como referencia a un catálogo:
ver el docstring de app/models/equipo.py.

Sin tipos ENUM, así que el downgrade no necesita limpieza adicional.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'b7d2e5f18c40'
down_revision: str | None = 'a4e1c7b90d32'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Aplica los cambios."""
    op.create_table(
        'configuraciones_equipo',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('proyecto_id', sa.Integer(), nullable=False),
        # Panel
        sa.Column('panel_marca', sa.String(length=80), nullable=False),
        sa.Column('panel_modelo', sa.String(length=100), nullable=False),
        sa.Column('panel_potencia_wp', sa.Float(), nullable=False),
        sa.Column('panel_largo_mm', sa.Float(), nullable=False),
        sa.Column('panel_ancho_mm', sa.Float(), nullable=False),
        sa.Column('panel_voc_v', sa.Float(), nullable=False),
        sa.Column('panel_vmp_v', sa.Float(), nullable=False),
        sa.Column('angulo_montaje', sa.Float(), nullable=False),
        # Inversor
        sa.Column('inversor_marca', sa.String(length=80), nullable=False),
        sa.Column('inversor_modelo', sa.String(length=100), nullable=False),
        sa.Column('inversor_potencia_kw', sa.Float(), nullable=False),
        sa.Column('inversor_vmax_v', sa.Float(), nullable=True),
        sa.Column('inversor_vmin_v', sa.Float(), nullable=True),
        sa.Column('inversor_mppts', sa.Integer(), nullable=True),
        sa.Column('inversor_strings_por_mppt', sa.Integer(), nullable=True),
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
            name='fk_configuraciones_equipo_proyecto_id_proyectos',
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_configuraciones_equipo_proyecto_id'),
        'configuraciones_equipo',
        ['proyecto_id'],
        unique=True,
    )


def downgrade() -> None:
    """Revierte los cambios."""
    op.drop_index(
        op.f('ix_configuraciones_equipo_proyecto_id'),
        table_name='configuraciones_equipo',
    )
    op.drop_table('configuraciones_equipo')
