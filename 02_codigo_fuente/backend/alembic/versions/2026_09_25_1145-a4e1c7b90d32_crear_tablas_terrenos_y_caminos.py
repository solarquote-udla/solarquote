"""crear tablas terrenos y caminos

Revision ID: a4e1c7b90d32
Revises: 036e02095cb0
Create Date: 2026-09-25 11:45:00.000000

Módulo 1 (RF-01). La geometría se guarda en JSONB: el terreno y cada
camino son una lista ordenada de vértices [[x, y], ...] en metros.

Se eligió JSONB sobre columnas escalares porque el criterio de
aceptación pide vértices, no largo y ancho, y sobre PostGIS porque el
volumen no justifica la extensión. El detalle está documentado en
app/models/terreno.py.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'a4e1c7b90d32'
down_revision: str | None = '036e02095cb0'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Aplica los cambios."""
    op.create_table(
        'terrenos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('proyecto_id', sa.Integer(), nullable=False),
        sa.Column('vertices', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('orientacion_norte', sa.Float(), nullable=True),
        sa.Column('notas', sa.String(length=500), nullable=True),
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
        # ondelete CASCADE: el terreno no tiene sentido sin su proyecto.
        sa.ForeignKeyConstraint(
            ['proyecto_id'], ['proyectos.id'],
            name='fk_terrenos_proyecto_id_proyectos',
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    # Índice único: relación uno a uno con proyecto.
    op.create_index(
        op.f('ix_terrenos_proyecto_id'), 'terrenos', ['proyecto_id'], unique=True
    )

    op.create_table(
        'caminos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('terreno_id', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.String(length=100), nullable=True),
        sa.Column(
            'tipo',
            sa.Enum('acceso', 'interno', 'mantenimiento', name='tipo_camino'),
            nullable=False,
        ),
        sa.Column('vertices', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ['terreno_id'], ['terrenos.id'],
            name='fk_caminos_terreno_id_terrenos',
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_caminos_terreno_id'), 'caminos', ['terreno_id'], unique=False
    )


def downgrade() -> None:
    """Revierte los cambios."""
    op.drop_index(op.f('ix_caminos_terreno_id'), table_name='caminos')
    op.drop_table('caminos')
    op.drop_index(op.f('ix_terrenos_proyecto_id'), table_name='terrenos')
    op.drop_table('terrenos')

    # Postgres conserva el tipo ENUM aunque se elimine la tabla que lo
    # usa. Sin esto, un `upgrade` posterior falla con DuplicateObject.
    sa.Enum(name='tipo_camino').drop(op.get_bind(), checkfirst=False)
