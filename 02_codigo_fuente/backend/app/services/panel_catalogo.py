"""Catálogo de paneles de referencia (RF-02)."""

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.panel import PanelCatalogo
from app.schemas.panel_catalogo import PanelCatalogoActualizar


class PanelDuplicado(ValueError):
    """Ya existe un panel con esa marca y modelo."""

    def __init__(self, marca: str, modelo: str) -> None:
        self.marca = marca
        self.modelo = modelo
        super().__init__(f"Ya existe un panel {marca} {modelo}")


class PanelIncoherente(ValueError):
    """Tras aplicar la actualización, el panel quedaría con datos mal."""

    def __init__(self, *, voc_vmp: bool = False) -> None:
        if voc_vmp:
            mensaje = "El Voc debe ser mayor que el Vmp."
        else:
            mensaje = "El largo es el lado mayor del panel: no puede quedar menor que el ancho."
        super().__init__(mensaje)


def listar_paneles(
    db: Session,
    incluir_inactivos: bool = False,
    *,
    marca: str | None = None,
    modelo: str | None = None,
    potencia_wp: float | None = None,
) -> list[PanelCatalogo]:
    query = db.query(PanelCatalogo)
    if not incluir_inactivos:
        query = query.filter(PanelCatalogo.activo.is_(True))
    if marca:
        query = query.filter(PanelCatalogo.marca.ilike(f"%{marca}%"))
    if modelo:
        query = query.filter(PanelCatalogo.modelo.ilike(f"%{modelo}%"))
    if potencia_wp is not None:
        query = query.filter(PanelCatalogo.potencia_wp == potencia_wp)
    return query.order_by(PanelCatalogo.marca.asc(), PanelCatalogo.modelo.asc()).all()


def buscar_paneles(db: Session, texto: str, incluir_inactivos: bool = False) -> list[PanelCatalogo]:
    """
    Búsqueda libre: coincide con marca, modelo o potencia (RF-02, catálogo
    con búsqueda). Si `texto` es un número (p. ej. "580"), también
    compara contra `potencia_wp`: "580" sí encuentra un panel de 580 Wp,
    aunque ningún panel tenga "580" en la marca o el modelo.
    """
    query = db.query(PanelCatalogo)
    if not incluir_inactivos:
        query = query.filter(PanelCatalogo.activo.is_(True))
    comodin = f"%{texto}%"
    condiciones = [PanelCatalogo.marca.ilike(comodin), PanelCatalogo.modelo.ilike(comodin)]
    try:
        potencia = float(texto)
    except ValueError:
        pass
    else:
        condiciones.append(PanelCatalogo.potencia_wp == potencia)
    query = query.filter(or_(*condiciones))
    return query.order_by(PanelCatalogo.marca.asc(), PanelCatalogo.modelo.asc()).all()


def obtener_panel(db: Session, panel_id: int) -> PanelCatalogo | None:
    return db.get(PanelCatalogo, panel_id)


def crear_panel(
    db: Session,
    *,
    marca: str,
    modelo: str,
    potencia_wp: float,
    largo_mm: float,
    ancho_mm: float,
    voc_v: float,
    vmp_v: float,
) -> PanelCatalogo:
    """Lanza `PanelDuplicado` si ya existe un panel con esa marca y modelo."""
    panel = PanelCatalogo(
        marca=marca,
        modelo=modelo,
        potencia_wp=potencia_wp,
        largo_mm=largo_mm,
        ancho_mm=ancho_mm,
        voc_v=voc_v,
        vmp_v=vmp_v,
    )
    db.add(panel)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if _es_marca_modelo_duplicado(exc):
            raise PanelDuplicado(marca, modelo) from None
        raise
    db.refresh(panel)
    return panel


def actualizar_panel(db: Session, panel_id: int, datos: PanelCatalogoActualizar) -> PanelCatalogo | None:
    """
    `None` si el panel no existe.

    `exclude_unset`: solo los campos que vinieron en el request, para
    distinguir "no lo mandaron" (queda igual) de "lo mandaron en null"
    (se borra, bloqueado para los obligatorios por el schema).
    """
    panel = db.get(PanelCatalogo, panel_id)
    if panel is None:
        return None

    cambios = datos.model_dump(exclude_unset=True)
    for campo, valor in cambios.items():
        setattr(panel, campo, valor)

    # El schema solo valida cada regla cuando el request trae los dos
    # campos involucrados juntos; acá, ya con el registro fusionado, se
    # completa la coherencia para el caso en que la actualización deja
    # colgado un solo lado (p. ej. sube vmp_v por encima del voc_v que ya
    # tenía guardado, mandando solo vmp_v).
    if panel.voc_v <= panel.vmp_v:
        db.rollback()
        raise PanelIncoherente(voc_vmp=True)
    if panel.largo_mm < panel.ancho_mm:
        db.rollback()
        raise PanelIncoherente

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if _es_marca_modelo_duplicado(exc):
            raise PanelDuplicado(panel.marca, panel.modelo) from None
        raise
    db.refresh(panel)
    return panel


def _es_marca_modelo_duplicado(exc: IntegrityError) -> bool:
    """Distingue la violación del unique (marca, modelo) de cualquier otra."""
    diag = getattr(exc.orig, "diag", None)
    return getattr(diag, "constraint_name", None) == "ux_panel_marca_modelo"
