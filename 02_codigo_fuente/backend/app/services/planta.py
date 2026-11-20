"""
Planta de una cotización para el historial (revisión con HEXtructure del
17 de noviembre de 2026: Santi quiere ver el plano del proyecto desde el
historial).

Arma la misma respuesta que el Paso 1 (terreno) y el Paso 3 (layout) del
proyecto de la cotización, pero con el permiso del historial: quien
consulta cotizaciones ve el plano sin poder editarlo.
"""

from sqlalchemy.orm import Session

from app.models.cotizacion import Cotizacion
from app.schemas.planta import PlantaLeer
from app.services import layout as servicio_layout
from app.services import terreno as servicio_terreno
from app.services.equipo import obtener_configuracion
from app.services.proyecto import obtener_proyecto


def obtener_planta(db: Session, cotizacion: Cotizacion) -> PlantaLeer:
    vacia = PlantaLeer(
        cotizacion_id=cotizacion.id,
        proyecto_id=cotizacion.proyecto_id,
        terreno=None,
        layout=None,
        cambio_despues_de_cotizar=False,
    )
    if cotizacion.proyecto_id is None:
        return vacia
    proyecto = obtener_proyecto(db, cotizacion.proyecto_id)
    if proyecto is None:
        return vacia

    terreno = servicio_terreno.obtener_terreno(db, proyecto.id)
    layout = servicio_layout.obtener_layout(db, proyecto.id)

    respuesta_layout = None
    if layout is not None:
        respuesta_layout = servicio_layout.a_respuesta(
            layout, servicio_layout.huella_actual(db, proyecto), obtener_configuracion(db, proyecto.id)
        )

    cambios = [m.updated_at for m in (terreno, layout) if m is not None and m.updated_at is not None]
    cambio = any(fecha > cotizacion.created_at for fecha in cambios)

    return PlantaLeer(
        cotizacion_id=cotizacion.id,
        proyecto_id=proyecto.id,
        terreno=servicio_terreno.a_respuesta(terreno) if terreno is not None else None,
        layout=respuesta_layout,
        cambio_despues_de_cotizar=cambio,
    )
