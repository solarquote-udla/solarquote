"""varios inversores por proyecto (RF-02, RF-03)

El equipo deja de tener un solo inversor:

  1. Crea `inversores_equipo` (uno o más por configuración).
  2. Copia el inversor de cada configuración existente como "Inversor 1".
  3. Elimina las columnas `inversor_*` de `configuraciones_equipo` y
     agrega `potencia_objetivo_kwp`.
  4. Agrega `bloques_layout.inversor`: los bloques existentes quedan en
     el Inversor 1, que era el único.

El downgrade conserva solo el Inversor 1 de cada configuración y
descarta la asignación de los bloques.

Revision ID: c3a8d61f04b2
Revises: 5f28731898bd
Create Date: 2026-10-16 12:00:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'c3a8d61f04b2'
down_revision: str | None = '5f28731898bd'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Aplica los cambios."""
    op.create_table(
        'inversores_equipo',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('configuracion_id', sa.Integer(), nullable=False),
        sa.Column('orden', sa.Integer(), nullable=False),
        sa.Column('marca', sa.String(length=80), nullable=False),
        sa.Column('modelo', sa.String(length=100), nullable=False),
        sa.Column('potencia_kw', sa.Float(), nullable=False),
        sa.Column('vmax_v', sa.Float(), nullable=True),
        sa.Column('vmin_v', sa.Float(), nullable=True),
        sa.Column('mppts', sa.Integer(), nullable=True),
        sa.Column('strings_por_mppt', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['configuracion_id'], ['configuraciones_equipo.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('configuracion_id', 'orden', name='ux_inversor_equipo_orden'),
    )
    op.create_index(
        op.f('ix_inversores_equipo_configuracion_id'), 'inversores_equipo', ['configuracion_id'], unique=False
    )

    op.execute(
        """
        INSERT INTO inversores_equipo
            (configuracion_id, orden, marca, modelo, potencia_kw, vmax_v, vmin_v, mppts, strings_por_mppt)
        SELECT id, 0, inversor_marca, inversor_modelo, inversor_potencia_kw,
               inversor_vmax_v, inversor_vmin_v, inversor_mppts, inversor_strings_por_mppt
        FROM configuraciones_equipo
        """
    )

    for columna in (
        'inversor_marca',
        'inversor_modelo',
        'inversor_potencia_kw',
        'inversor_vmax_v',
        'inversor_vmin_v',
        'inversor_mppts',
        'inversor_strings_por_mppt',
    ):
        op.drop_column('configuraciones_equipo', columna)

    op.add_column('configuraciones_equipo', sa.Column('potencia_objetivo_kwp', sa.Float(), nullable=True))

    # Los bloques existentes van al Inversor 1, el único que había
    op.add_column(
        'bloques_layout',
        sa.Column('inversor', sa.Integer(), server_default='0', nullable=False),
    )


def downgrade() -> None:
    """Revierte los cambios."""
    op.drop_column('bloques_layout', 'inversor')
    op.drop_column('configuraciones_equipo', 'potencia_objetivo_kwp')

    op.add_column('configuraciones_equipo', sa.Column('inversor_marca', sa.String(length=80), nullable=True))
    op.add_column('configuraciones_equipo', sa.Column('inversor_modelo', sa.String(length=100), nullable=True))
    op.add_column('configuraciones_equipo', sa.Column('inversor_potencia_kw', sa.Float(), nullable=True))
    op.add_column('configuraciones_equipo', sa.Column('inversor_vmax_v', sa.Float(), nullable=True))
    op.add_column('configuraciones_equipo', sa.Column('inversor_vmin_v', sa.Float(), nullable=True))
    op.add_column('configuraciones_equipo', sa.Column('inversor_mppts', sa.Integer(), nullable=True))
    op.add_column('configuraciones_equipo', sa.Column('inversor_strings_por_mppt', sa.Integer(), nullable=True))

    # Solo cabe uno: se conserva el Inversor 1
    op.execute(
        """
        UPDATE configuraciones_equipo AS c
        SET inversor_marca = i.marca,
            inversor_modelo = i.modelo,
            inversor_potencia_kw = i.potencia_kw,
            inversor_vmax_v = i.vmax_v,
            inversor_vmin_v = i.vmin_v,
            inversor_mppts = i.mppts,
            inversor_strings_por_mppt = i.strings_por_mppt
        FROM inversores_equipo AS i
        WHERE i.configuracion_id = c.id AND i.orden = 0
        """
    )
    op.alter_column('configuraciones_equipo', 'inversor_marca', nullable=False)
    op.alter_column('configuraciones_equipo', 'inversor_modelo', nullable=False)
    op.alter_column('configuraciones_equipo', 'inversor_potencia_kw', nullable=False)

    op.drop_index(op.f('ix_inversores_equipo_configuracion_id'), table_name='inversores_equipo')
    op.drop_table('inversores_equipo')
