"""
Planta de una cotización: el terreno y el layout del proyecto, para verlos
desde el historial (revisión con HEXtructure del 17 de noviembre de 2026).
"""

from pydantic import BaseModel

from app.schemas.layout import LayoutLeer
from app.schemas.terreno import TerrenoLeer


class PlantaLeer(BaseModel):
    cotizacion_id: int
    proyecto_id: int | None
    # Nulos si la cotización no tiene proyecto (cotización directa), si
    # salió de un boceto o si el proyecto todavía no tiene terreno o layout.
    terreno: TerrenoLeer | None
    layout: LayoutLeer | None
    # La cotización no guarda una copia del plano: si el terreno o el
    # layout cambiaron después de emitirla, el plano ya no es el cotizado.
    cambio_despues_de_cotizar: bool
