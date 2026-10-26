"""validación de materiales (RF-14, RF-15 y RF-16)

  1. `despachos` e `items_despacho`: el despacho en planta de cada
     cotización, con la trazabilidad del lote y lo que salió de cada
     material frente a lo cotizado.
  2. `recepciones` e `items_recepcion`: el checklist de la recepción en
     terreno (OK, diferencia o pendiente por material).
  3. `fotos_validacion`: las fotos del lote y la evidencia de la recepción.
  4. `cotizaciones.instalada_at` e `instalada_por_id`: el cierre del ciclo
     de la propuesta, que se registra a mano.

Revision ID: 710d46c09d78
Revises: a7d2c5e8f914
Create Date: 2026-10-25 12:00:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '710d46c09d78'
down_revision: str | None = 'a7d2c5e8f914'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Aplica los cambios."""
    op.create_table('despachos',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('cotizacion_id', sa.Integer(), nullable=False),
    sa.Column('usuario_id', sa.Integer(), nullable=False),
    sa.Column('fabricado_por', sa.String(length=120), nullable=False),
    sa.Column('soldado_por', sa.String(length=120), nullable=False),
    sa.Column('contado_por', sa.String(length=120), nullable=False),
    sa.Column('despachado_por', sa.String(length=120), nullable=False),
    sa.Column('destino', sa.String(length=200), nullable=False),
    sa.Column('justificacion', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['cotizacion_id'], ['cotizaciones.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_despachos_cotizacion_id'), 'despachos', ['cotizacion_id'], unique=True)
    op.create_table('recepciones',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('cotizacion_id', sa.Integer(), nullable=False),
    sa.Column('usuario_id', sa.Integer(), nullable=False),
    sa.Column('recibido_por', sa.String(length=120), nullable=False),
    sa.Column('observaciones', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['cotizacion_id'], ['cotizaciones.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_recepciones_cotizacion_id'), 'recepciones', ['cotizacion_id'], unique=True)
    op.create_table('fotos_validacion',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('despacho_id', sa.Integer(), nullable=True),
    sa.Column('recepcion_id', sa.Integer(), nullable=True),
    sa.Column('material_id', sa.Integer(), nullable=True),
    sa.Column('nombre_archivo', sa.String(length=255), nullable=False),
    sa.Column('formato', sa.String(length=4), nullable=False),
    sa.Column('tamano_bytes', sa.Integer(), nullable=False),
    sa.Column('contenido', sa.LargeBinary(), nullable=False),
    sa.Column('conteo_ia', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("formato IN ('png', 'jpg')", name='ck_fotos_validacion_formato'),
    sa.CheckConstraint('(despacho_id IS NOT NULL AND recepcion_id IS NULL) OR (despacho_id IS NULL AND recepcion_id IS NOT NULL)', name='ck_fotos_validacion_un_dueno'),
    sa.ForeignKeyConstraint(['despacho_id'], ['despachos.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['material_id'], ['materiales.id'], ),
    sa.ForeignKeyConstraint(['recepcion_id'], ['recepciones.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_fotos_validacion_despacho_id'), 'fotos_validacion', ['despacho_id'], unique=False)
    op.create_index(op.f('ix_fotos_validacion_recepcion_id'), 'fotos_validacion', ['recepcion_id'], unique=False)
    op.create_table('items_despacho',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('despacho_id', sa.Integer(), nullable=False),
    sa.Column('material_id', sa.Integer(), nullable=False),
    sa.Column('codigo', sa.String(length=30), nullable=False),
    sa.Column('nombre', sa.String(length=150), nullable=False),
    sa.Column('cantidad_cotizada', sa.Integer(), nullable=False),
    sa.Column('cantidad_despachada', sa.Integer(), nullable=False),
    sa.Column('conteo_ia', sa.Integer(), nullable=True),
    sa.CheckConstraint('cantidad_cotizada >= 0', name='ck_items_despacho_cotizada'),
    sa.CheckConstraint('cantidad_despachada >= 0', name='ck_items_despacho_despachada'),
    sa.CheckConstraint('conteo_ia IS NULL OR conteo_ia >= 0', name='ck_items_despacho_conteo_ia'),
    sa.ForeignKeyConstraint(['despacho_id'], ['despachos.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['material_id'], ['materiales.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('despacho_id', 'material_id', name='uq_items_despacho_material')
    )
    op.create_index(op.f('ix_items_despacho_despacho_id'), 'items_despacho', ['despacho_id'], unique=False)
    op.create_table('items_recepcion',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('recepcion_id', sa.Integer(), nullable=False),
    sa.Column('material_id', sa.Integer(), nullable=False),
    sa.Column('codigo', sa.String(length=30), nullable=False),
    sa.Column('nombre', sa.String(length=150), nullable=False),
    sa.Column('cantidad_esperada', sa.Integer(), nullable=False),
    sa.Column('cantidad_recibida', sa.Integer(), nullable=True),
    sa.Column('estado', sa.String(length=10), nullable=False),
    sa.Column('observacion', sa.String(length=500), nullable=True),
    sa.CheckConstraint("(estado = 'ok' AND cantidad_recibida = cantidad_esperada) OR (estado = 'diferencia' AND cantidad_recibida IS NOT NULL AND cantidad_recibida >= 0 AND cantidad_recibida <> cantidad_esperada AND length(trim(observacion)) > 0) OR (estado = 'pendiente' AND cantidad_recibida IS NULL)", name='ck_items_recepcion_coherencia'),
    sa.CheckConstraint("estado IN ('ok', 'diferencia', 'pendiente')", name='ck_items_recepcion_estado'),
    sa.CheckConstraint('cantidad_esperada >= 0', name='ck_items_recepcion_esperada'),
    sa.ForeignKeyConstraint(['material_id'], ['materiales.id'], ),
    sa.ForeignKeyConstraint(['recepcion_id'], ['recepciones.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('recepcion_id', 'material_id', name='uq_items_recepcion_material')
    )
    op.create_index(op.f('ix_items_recepcion_recepcion_id'), 'items_recepcion', ['recepcion_id'], unique=False)
    op.add_column('cotizaciones', sa.Column('instalada_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('cotizaciones', sa.Column('instalada_por_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_cotizaciones_instalada_por_id_usuarios', 'cotizaciones', 'usuarios', ['instalada_por_id'], ['id'])
    # Si alguna cotización ya figura instalada (datos de demostración), toma
    # como fecha de instalación la de su última actualización
    op.execute("UPDATE cotizaciones SET instalada_at = updated_at WHERE estado = 'instalada' AND instalada_at IS NULL")
    op.create_check_constraint('ck_cotizaciones_instalacion', 'cotizaciones', "(estado = 'instalada') = (instalada_at IS NOT NULL)")


def downgrade() -> None:
    """Revierte los cambios."""
    op.drop_constraint('ck_cotizaciones_instalacion', 'cotizaciones', type_='check')
    op.drop_constraint('fk_cotizaciones_instalada_por_id_usuarios', 'cotizaciones', type_='foreignkey')
    op.drop_column('cotizaciones', 'instalada_por_id')
    op.drop_column('cotizaciones', 'instalada_at')
    op.drop_index(op.f('ix_items_recepcion_recepcion_id'), table_name='items_recepcion')
    op.drop_table('items_recepcion')
    op.drop_index(op.f('ix_items_despacho_despacho_id'), table_name='items_despacho')
    op.drop_table('items_despacho')
    op.drop_index(op.f('ix_fotos_validacion_recepcion_id'), table_name='fotos_validacion')
    op.drop_index(op.f('ix_fotos_validacion_despacho_id'), table_name='fotos_validacion')
    op.drop_table('fotos_validacion')
    op.drop_index(op.f('ix_recepciones_cotizacion_id'), table_name='recepciones')
    op.drop_table('recepciones')
    op.drop_index(op.f('ix_despachos_cotizacion_id'), table_name='despachos')
    op.drop_table('despachos')
