"""perfiles y permisos de usuarios (RF-11)

Reemplaza el rol fijo de cada usuario por un perfil con permisos por
opción de menú.

  1. Crea `perfiles` y `perfil_permisos`.
  2. Siembra los dos perfiles del sistema (Gerente General con acceso
     total; Personal de Producción con Despacho y Recepción).
  3. Asigna a cada usuario el perfil que corresponde a su rol actual.
  4. Agrega los campos de seguridad de la cuenta y elimina `rol`.

El downgrade devuelve un rol a cada usuario: Gerente General si su perfil
tiene acceso total, Personal de Producción en cualquier otro caso (el
menor privilegio). Los perfiles personalizados se pierden.

Revision ID: 9c1e4b7a2d50
Revises: 26f2e122b07e
Create Date: 2026-10-13 12:00:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '9c1e4b7a2d50'
down_revision: str | None = '26f2e122b07e'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


ROL_USUARIO = sa.Enum('gerente_general', 'personal_produccion', name='rol_usuario')


def upgrade() -> None:
    """Aplica los cambios."""
    op.create_table(
        'perfiles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.String(length=60), nullable=False),
        sa.Column('descripcion', sa.String(length=255), nullable=True),
        sa.Column('clave', sa.String(length=40), nullable=True),
        sa.Column('acceso_total', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('nombre'),
        sa.UniqueConstraint('clave'),
    )
    op.create_table(
        'perfil_permisos',
        sa.Column('perfil_id', sa.Integer(), nullable=False),
        sa.Column('codigo', sa.String(length=40), nullable=False),
        sa.ForeignKeyConstraint(['perfil_id'], ['perfiles.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('perfil_id', 'codigo'),
    )

    # Perfiles del sistema. La clave coincide con el valor del rol viejo
    # para que el paso 3 sea un UPDATE directo.
    op.execute(
        """
        INSERT INTO perfiles (nombre, descripcion, clave, acceso_total) VALUES
          ('Gerente General', 'Acceso completo a todos los módulos', 'gerente_general', true),
          ('Personal de Producción', 'Validación de materiales en planta y en terreno', 'personal_produccion', false)
        """
    )
    op.execute(
        """
        INSERT INTO perfil_permisos (perfil_id, codigo)
        SELECT id, codigo FROM perfiles, (VALUES ('despacho'), ('recepcion')) AS p(codigo)
        WHERE clave = 'personal_produccion'
        """
    )

    op.add_column('usuarios', sa.Column('perfil_id', sa.Integer(), nullable=True))
    op.add_column('usuarios', sa.Column('debe_cambiar_password', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('usuarios', sa.Column('ultimo_acceso', sa.DateTime(timezone=True), nullable=True))
    op.add_column('usuarios', sa.Column('intentos_fallidos', sa.Integer(), server_default='0', nullable=False))
    op.add_column('usuarios', sa.Column('bloqueado_hasta', sa.DateTime(timezone=True), nullable=True))
    op.add_column('usuarios', sa.Column('version_token', sa.Integer(), server_default='0', nullable=False))

    op.execute(
        """
        UPDATE usuarios u SET perfil_id = p.id
        FROM perfiles p
        WHERE p.clave = u.rol::text
        """
    )

    op.alter_column('usuarios', 'perfil_id', nullable=False)
    op.create_index(op.f('ix_usuarios_perfil_id'), 'usuarios', ['perfil_id'], unique=False)
    op.create_foreign_key(
        'usuarios_perfil_id_fkey', 'usuarios', 'perfiles', ['perfil_id'], ['id'], ondelete='RESTRICT'
    )

    op.drop_column('usuarios', 'rol')
    ROL_USUARIO.drop(op.get_bind(), checkfirst=False)


def downgrade() -> None:
    """Revierte los cambios."""
    ROL_USUARIO.create(op.get_bind(), checkfirst=False)
    op.add_column('usuarios', sa.Column('rol', ROL_USUARIO, nullable=True))
    op.execute(
        """
        UPDATE usuarios u SET rol = CASE
            WHEN p.acceso_total THEN 'gerente_general'::rol_usuario
            ELSE 'personal_produccion'::rol_usuario
          END
        FROM perfiles p
        WHERE p.id = u.perfil_id
        """
    )
    op.alter_column('usuarios', 'rol', nullable=False)

    op.drop_constraint('usuarios_perfil_id_fkey', 'usuarios', type_='foreignkey')
    op.drop_index(op.f('ix_usuarios_perfil_id'), table_name='usuarios')
    op.drop_column('usuarios', 'version_token')
    op.drop_column('usuarios', 'bloqueado_hasta')
    op.drop_column('usuarios', 'intentos_fallidos')
    op.drop_column('usuarios', 'ultimo_acceso')
    op.drop_column('usuarios', 'debe_cambiar_password')
    op.drop_column('usuarios', 'perfil_id')

    op.drop_table('perfil_permisos')
    op.drop_table('perfiles')
