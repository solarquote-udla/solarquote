"""
Validación de materiales (RF-14, RF-15 y RF-16).

Cinco tablas:

  despachos          el despacho en planta de una cotización (RF-14)
  items_despacho     cuánto se cotizó y cuánto salió de cada material
  recepciones        la recepción en terreno de ese despacho (RF-15)
  items_recepcion    el checklist: esperado, recibido y estado por material
  fotos_validacion   las fotos del lote o de la recepción, como evidencia

Una cotización se despacha y se recibe una sola vez: el lote es la
cotización completa. Los despachos parciales (varios camiones por
proyecto) quedan como trabajo futuro; por eso la cotización tiene a lo
sumo un despacho y una recepción (`cotizacion_id` único).

Los ítems copian el código y el nombre del material: el reporte de un
despacho no debe cambiar si después se renombra el material en el
catálogo, igual que la cotización conserva sus precios.

El estado de la propuesta (RF-16) vive en `cotizaciones.estado` y su
línea de tiempo se arma con las fechas de estas tablas: cotizada (la
cotización), despachada (el despacho), recibida (la recepción) e
instalada (`cotizaciones.instalada_at`).
"""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, LargeBinary, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, deferred, mapped_column, relationship

from app.core.database import Base

ESTADOS_ITEM_RECEPCION = ("ok", "diferencia", "pendiente")


class Despacho(Base):
    __tablename__ = "despachos"

    id: Mapped[int] = mapped_column(primary_key=True)
    cotizacion_id: Mapped[int] = mapped_column(
        ForeignKey("cotizaciones.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    # Quién registró el despacho en el sistema
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)

    # ─── Trazabilidad del lote (RF-14) ──────────────────────────
    # Nombres escritos por el operario: quienes fabrican o sueldan no
    # siempre tienen usuario en el sistema.
    fabricado_por: Mapped[str] = mapped_column(String(120), nullable=False)
    soldado_por: Mapped[str] = mapped_column(String(120), nullable=False)
    contado_por: Mapped[str] = mapped_column(String(120), nullable=False)
    despachado_por: Mapped[str] = mapped_column(String(120), nullable=False)
    destino: Mapped[str] = mapped_column(String(200), nullable=False)

    # Obligatoria cuando alguna cantidad despachada difiere de la cotizada
    justificacion: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    items: Mapped[list["ItemDespacho"]] = relationship(
        back_populates="despacho", cascade="all, delete-orphan", order_by="ItemDespacho.id"
    )
    fotos: Mapped[list["FotoValidacion"]] = relationship(
        back_populates="despacho", cascade="all, delete-orphan", order_by="FotoValidacion.id"
    )
    usuario: Mapped["Usuario"] = relationship()  # noqa: F821

    def __repr__(self) -> str:
        return f"<Despacho cotizacion={self.cotizacion_id}>"


class ItemDespacho(Base):
    __tablename__ = "items_despacho"
    __table_args__ = (
        UniqueConstraint("despacho_id", "material_id", name="uq_items_despacho_material"),
        CheckConstraint("cantidad_cotizada >= 0", name="ck_items_despacho_cotizada"),
        CheckConstraint("cantidad_despachada >= 0", name="ck_items_despacho_despachada"),
        CheckConstraint("conteo_ia IS NULL OR conteo_ia >= 0", name="ck_items_despacho_conteo_ia"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    despacho_id: Mapped[int] = mapped_column(ForeignKey("despachos.id", ondelete="CASCADE"), nullable=False, index=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("materiales.id"), nullable=False)
    codigo: Mapped[str] = mapped_column(String(30), nullable=False)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    cantidad_cotizada: Mapped[int] = mapped_column(nullable=False)
    cantidad_despachada: Mapped[int] = mapped_column(nullable=False)
    # Suma de los conteos de la IA en las fotos de este material, si se usó
    conteo_ia: Mapped[int | None] = mapped_column(nullable=True)

    despacho: Mapped[Despacho] = relationship(back_populates="items")


class Recepcion(Base):
    __tablename__ = "recepciones"

    id: Mapped[int] = mapped_column(primary_key=True)
    cotizacion_id: Mapped[int] = mapped_column(
        ForeignKey("cotizaciones.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)
    # Quién recibió en terreno: el instalador o el operario, con o sin usuario
    recibido_por: Mapped[str] = mapped_column(String(120), nullable=False)
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    items: Mapped[list["ItemRecepcion"]] = relationship(
        back_populates="recepcion", cascade="all, delete-orphan", order_by="ItemRecepcion.id"
    )
    fotos: Mapped[list["FotoValidacion"]] = relationship(
        back_populates="recepcion", cascade="all, delete-orphan", order_by="FotoValidacion.id"
    )
    usuario: Mapped["Usuario"] = relationship()  # noqa: F821

    def __repr__(self) -> str:
        return f"<Recepcion cotizacion={self.cotizacion_id}>"


class ItemRecepcion(Base):
    __tablename__ = "items_recepcion"
    __table_args__ = (
        UniqueConstraint("recepcion_id", "material_id", name="uq_items_recepcion_material"),
        CheckConstraint("cantidad_esperada >= 0", name="ck_items_recepcion_esperada"),
        CheckConstraint("estado IN ('ok', 'diferencia', 'pendiente')", name="ck_items_recepcion_estado"),
        # OK: llegó lo esperado. Diferencia: llegó otra cantidad y se explica.
        # Pendiente: todavía no se verifica, sin cantidad.
        CheckConstraint(
            "(estado = 'ok' AND cantidad_recibida = cantidad_esperada)"
            " OR (estado = 'diferencia' AND cantidad_recibida IS NOT NULL AND cantidad_recibida >= 0"
            " AND cantidad_recibida <> cantidad_esperada AND length(trim(observacion)) > 0)"
            " OR (estado = 'pendiente' AND cantidad_recibida IS NULL)",
            name="ck_items_recepcion_coherencia",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    recepcion_id: Mapped[int] = mapped_column(ForeignKey("recepciones.id", ondelete="CASCADE"), nullable=False, index=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("materiales.id"), nullable=False)
    codigo: Mapped[str] = mapped_column(String(30), nullable=False)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    # Lo que salió de planta según el despacho
    cantidad_esperada: Mapped[int] = mapped_column(nullable=False)
    cantidad_recibida: Mapped[int | None] = mapped_column(nullable=True)
    estado: Mapped[str] = mapped_column(String(10), nullable=False)
    observacion: Mapped[str | None] = mapped_column(String(500), nullable=True)

    recepcion: Mapped[Recepcion] = relationship(back_populates="items")


class FotoValidacion(Base):
    """
    Foto del lote en el despacho (con el material que muestra y lo que
    contó la IA) o evidencia de la recepción. Se guarda en la base, como
    el boceto: pesan poco y así el respaldo incluye todo.
    """

    __tablename__ = "fotos_validacion"
    __table_args__ = (
        CheckConstraint(
            "(despacho_id IS NOT NULL AND recepcion_id IS NULL) OR (despacho_id IS NULL AND recepcion_id IS NOT NULL)",
            name="ck_fotos_validacion_un_dueno",
        ),
        CheckConstraint("formato IN ('png', 'jpg')", name="ck_fotos_validacion_formato"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    despacho_id: Mapped[int | None] = mapped_column(ForeignKey("despachos.id", ondelete="CASCADE"), nullable=True, index=True)
    recepcion_id: Mapped[int | None] = mapped_column(
        ForeignKey("recepciones.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # En el despacho: el material que aparece en la foto
    material_id: Mapped[int | None] = mapped_column(ForeignKey("materiales.id"), nullable=True)
    nombre_archivo: Mapped[str] = mapped_column(String(255), nullable=False)
    formato: Mapped[str] = mapped_column(String(4), nullable=False)
    tamano_bytes: Mapped[int] = mapped_column(nullable=False)
    contenido: Mapped[bytes] = deferred(mapped_column(LargeBinary, nullable=False))
    conteo_ia: Mapped[int | None] = mapped_column(nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    despacho: Mapped[Despacho | None] = relationship(back_populates="fotos")
    recepcion: Mapped[Recepcion | None] = relationship(back_populates="fotos")
