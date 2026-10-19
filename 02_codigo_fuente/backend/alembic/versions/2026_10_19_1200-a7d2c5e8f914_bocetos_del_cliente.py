"""bocetos del cliente (RF-04 y RF-05)

  1. `bocetos`: el archivo que envía el cliente (PDF, imagen o DXF), uno
     por proyecto, y cómo se leyó (DXF directo o IA).
  2. `bloques_boceto`: los tipos de bloque detectados en notación L, A, B,
     que el Gerente corrige en la confirmación antes de cotizar.

Revision ID: a7d2c5e8f914
Revises: e1f4b3a9c207
Create Date: 2026-10-19 12:00:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'a7d2c5e8f914'
down_revision: str | None = 'e1f4b3a9c207'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Aplica los cambios."""
    op.create_table(
        'bocetos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('proyecto_id', sa.Integer(), nullable=False),
        sa.Column('usuario_id', sa.Integer(), nullable=False),
        sa.Column('nombre_archivo', sa.String(length=255), nullable=False),
        sa.Column('formato', sa.String(length=4), nullable=False),
        sa.Column('tamano_bytes', sa.Integer(), nullable=False),
        sa.Column('contenido', sa.LargeBinary(), nullable=False),
        sa.Column('metodo', sa.String(length=3), nullable=False),
        sa.Column('advertencias', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('ediciones_manuales', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['proyecto_id'], ['proyectos.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_bocetos_proyecto_id'), 'bocetos', ['proyecto_id'], unique=True)
    op.create_table(
        'bloques_boceto',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('boceto_id', sa.Integer(), nullable=False),
        sa.Column('orden', sa.Integer(), nullable=False),
        sa.Column('etiqueta', sa.String(length=20), nullable=True),
        sa.Column('paneles_largo', sa.Integer(), nullable=False),
        sa.Column('paneles_ancho', sa.Integer(), nullable=False),
        sa.Column('repeticiones', sa.Integer(), nullable=False),
        sa.Column('orientacion', sa.String(length=10), nullable=False),
        sa.Column('confianza', sa.Float(), nullable=True),
        sa.CheckConstraint('paneles_largo >= 1', name='ck_bloques_boceto_largo_positivo'),
        sa.CheckConstraint('paneles_ancho >= 1', name='ck_bloques_boceto_ancho_positivo'),
        sa.CheckConstraint('repeticiones >= 1', name='ck_bloques_boceto_repeticiones_positivas'),
        sa.CheckConstraint("orientacion IN ('vertical', 'horizontal')", name='ck_bloques_boceto_orientacion'),
        sa.ForeignKeyConstraint(['boceto_id'], ['bocetos.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_bloques_boceto_boceto_id'), 'bloques_boceto', ['boceto_id'], unique=False)


def downgrade() -> None:
    """Revierte los cambios."""
    op.drop_index(op.f('ix_bloques_boceto_boceto_id'), table_name='bloques_boceto')
    op.drop_table('bloques_boceto')
    op.drop_index(op.f('ix_bocetos_proyecto_id'), table_name='bocetos')
    op.drop_table('bocetos')
