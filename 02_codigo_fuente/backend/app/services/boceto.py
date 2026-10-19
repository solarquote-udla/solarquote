"""
Boceto del cliente — RF-04 (carga y lectura) y RF-05 (confirmación).

Flujo:
  1. El Gerente carga el archivo que envió el cliente (PDF, imagen o DXF).
  2. ia-service lo interpreta: los DXF se leen directo de la geometría,
     los PDF e imágenes con la IA. Devuelve los tipos de bloque en
     notación L, A, B.
  3. Se guardan el archivo y los tipos. Un boceto nuevo reemplaza al
     anterior del mismo proyecto.
  4. En la confirmación el Gerente corrige los tipos si hace falta
     (la IA puede equivocarse) y confirma para cotizar.

La proporción antisísmica se evalúa con el panel del proyecto si ya se
configuró el equipo (RF-02) y, si no, con el panel de referencia de
2278 × 1134 mm, el más usado por los clientes de HEXtructure.
"""

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session

from app.data.paneles_referencia import PANELES_REFERENCIA
from app.models.boceto import BloqueBoceto, Boceto
from app.models.proyecto import EstadoProyecto, Proyecto
from app.models.usuario import Usuario
from app.schemas.boceto import BloqueBocetoLeer, BocetoBloquesEditar, BocetoLeer, PanelReferencia
from app.services.calculo_layout import TOLERANCIA_DEFECTO, cumple_proporcion, proporcion_bloque
from app.services.equipo import obtener_configuracion
from app.services.ia_service import IaServiceError, interpretar_boceto
from app.services.proyecto import avanzar_a_en_diseno

TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024

# Panel de 2278 × 1134 mm: el primero del catálogo de referencia
_REFERENCIA = PANELES_REFERENCIA[0]


class BocetoNoEditable(ValueError):
    """El proyecto ya se cotizó: su boceto queda como respaldo de la proforma."""


class _BloqueRecibido(BaseModel):
    etiqueta: str | None = Field(default=None, max_length=20)
    paneles_largo: int = Field(ge=1)
    paneles_ancho: int = Field(ge=1)
    repeticiones: int = Field(ge=1)
    orientacion: str = Field(pattern="^(vertical|horizontal)$")
    confianza: float | None = Field(default=None, ge=0, le=1)


class _ResultadoRecibido(BaseModel):
    formato: str = Field(pattern="^(pdf|png|jpg|dxf)$")
    metodo: str = Field(pattern="^(dxf|ia)$")
    bloques: list[_BloqueRecibido]
    advertencias: list[str] = []


def obtener_boceto(db: Session, proyecto_id: int) -> Boceto | None:
    return db.query(Boceto).filter(Boceto.proyecto_id == proyecto_id).one_or_none()


def _verificar_editable(proyecto: Proyecto) -> None:
    if proyecto.estado == EstadoProyecto.COTIZADO:
        raise BocetoNoEditable(
            "El proyecto ya está cotizado: su boceto queda como respaldo de la proforma y no se puede cambiar."
        )


def cargar_boceto(
    db: Session, proyecto: Proyecto, usuario: Usuario, nombre_archivo: str, contenido: bytes
) -> Boceto:
    """
    Interpreta el archivo con ia-service y lo guarda como el boceto del
    proyecto. Si ia-service falla no se guarda nada: el boceto anterior,
    si lo había, queda como estaba.
    """
    _verificar_editable(proyecto)
    nombre = (nombre_archivo or "boceto").strip()[-255:] or "boceto"

    crudo = interpretar_boceto(nombre, contenido)
    try:
        resultado = _ResultadoRecibido.model_validate(crudo)
    except ValidationError as exc:
        raise IaServiceError("El servicio de bocetos devolvió un resultado inválido.") from exc

    anterior = obtener_boceto(db, proyecto.id)
    if anterior is not None:
        db.delete(anterior)
        db.flush()

    boceto = Boceto(
        proyecto_id=proyecto.id,
        usuario_id=usuario.id,
        nombre_archivo=nombre,
        formato=resultado.formato,
        tamano_bytes=len(contenido),
        contenido=contenido,
        metodo=resultado.metodo,
        advertencias=resultado.advertencias,
        ediciones_manuales=0,
        bloques=[
            BloqueBoceto(
                orden=i,
                etiqueta=b.etiqueta,
                paneles_largo=b.paneles_largo,
                paneles_ancho=b.paneles_ancho,
                repeticiones=b.repeticiones,
                orientacion=b.orientacion,
                confianza=b.confianza,
            )
            for i, b in enumerate(resultado.bloques)
        ],
    )
    db.add(boceto)
    avanzar_a_en_diseno(proyecto)
    db.commit()
    db.refresh(boceto)
    return boceto


def editar_bloques(db: Session, proyecto: Proyecto, datos: BocetoBloquesEditar) -> Boceto:
    """
    Reemplaza los tipos de bloque por los que deja el Gerente. Un tipo que
    no cambió conserva la confianza de la IA; uno corregido la pierde,
    porque ya no es lo que la IA leyó.
    """
    _verificar_editable(proyecto)
    boceto = obtener_boceto(db, proyecto.id)
    if boceto is None:
        raise BocetoNoEditable("El proyecto todavía no tiene un boceto cargado.")

    def clave(b) -> tuple:
        return (b.etiqueta, b.paneles_largo, b.paneles_ancho, b.repeticiones, b.orientacion)

    confianza_de = {clave(b): b.confianza for b in boceto.bloques}
    nuevos = [
        BloqueBoceto(
            orden=i,
            etiqueta=b.etiqueta,
            paneles_largo=b.paneles_largo,
            paneles_ancho=b.paneles_ancho,
            repeticiones=b.repeticiones,
            orientacion=b.orientacion,
            confianza=confianza_de.get(clave(b)),
        )
        for i, b in enumerate(datos.bloques)
    ]
    cambio = [clave(b) for b in boceto.bloques] != [clave(b) for b in nuevos]
    if cambio:
        boceto.bloques.clear()
        db.flush()
        boceto.bloques.extend(nuevos)
        boceto.ediciones_manuales += 1
        db.commit()
        db.refresh(boceto)
    return boceto


def panel_de(db: Session, proyecto_id: int) -> PanelReferencia:
    equipo = obtener_configuracion(db, proyecto_id)
    if equipo is not None:
        return PanelReferencia(
            largo_mm=equipo.panel_largo_mm,
            ancho_mm=equipo.panel_ancho_mm,
            potencia_wp=equipo.panel_potencia_wp,
            origen="equipo",
        )
    return PanelReferencia(
        largo_mm=_REFERENCIA["largo_mm"], ancho_mm=_REFERENCIA["ancho_mm"], potencia_wp=None, origen="referencia"
    )


def a_respuesta(db: Session, boceto: Boceto) -> BocetoLeer:
    panel = panel_de(db, boceto.proyecto_id)
    mayor, menor = max(panel.largo_mm, panel.ancho_mm) / 1000, min(panel.largo_mm, panel.ancho_mm) / 1000
    bloques = []
    for b in boceto.bloques:
        prop = proporcion_bloque(b.paneles_largo, b.paneles_ancho, mayor, menor)
        bloques.append(
            BloqueBocetoLeer(
                etiqueta=b.etiqueta,
                paneles_largo=b.paneles_largo,
                paneles_ancho=b.paneles_ancho,
                repeticiones=b.repeticiones,
                orientacion=b.orientacion,
                confianza=b.confianza,
                paneles=b.paneles_largo * b.paneles_ancho * b.repeticiones,
                proporcion=round(prop, 3),
                en_proporcion=cumple_proporcion(prop, TOLERANCIA_DEFECTO),
            )
        )
    total = sum(b.paneles for b in bloques)
    return BocetoLeer(
        proyecto_id=boceto.proyecto_id,
        nombre_archivo=boceto.nombre_archivo,
        formato=boceto.formato,
        tamano_bytes=boceto.tamano_bytes,
        metodo=boceto.metodo,
        advertencias=list(boceto.advertencias or []),
        bloques=bloques,
        total_paneles=total,
        potencia_kwp=round(total * panel.potencia_wp / 1000, 2) if panel.potencia_wp else None,
        panel=panel,
        tolerancia_proporcion=TOLERANCIA_DEFECTO,
        ediciones_manuales=boceto.ediciones_manuales,
        created_at=boceto.created_at,
        updated_at=boceto.updated_at,
    )
