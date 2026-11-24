"""
Planos DWG de AutoCAD (revisión del 23 de noviembre: los planos de los
clientes llegan en DWG y no se podían cargar).

ezdxf solo lee DXF, así que el DWG se convierte primero con `dwg2dxf`, de
LibreDWG (se instala en el servidor con nixpacks.toml), y después se lee
igual que un DXF: por la geometría, sin IA.

Si el servidor no tiene el convertidor, se pide exportar el plano a DXF,
como antes.
"""

import shutil
import subprocess
import tempfile
from pathlib import Path

from app.services.dxf import DxfIlegible
from app.services.formato import FormatoNoAdmitido

CONVERTIDOR = "dwg2dxf"
TIEMPO_MAXIMO_S = 90

SIN_CONVERTIDOR = (
    "Este servidor todavía no puede convertir archivos DWG. Ábrelo en AutoCAD y guárdalo como DXF "
    "(Guardar como > DXF) para cargarlo."
)


class DwgIlegible(DxfIlegible):
    """El DWG no se pudo convertir a DXF (versión no admitida o archivo dañado)."""


def dwg_a_dxf(contenido: bytes) -> bytes:
    ruta = shutil.which(CONVERTIDOR)
    if ruta is None:
        raise FormatoNoAdmitido(SIN_CONVERTIDOR)
    with tempfile.TemporaryDirectory() as carpeta:
        entrada = Path(carpeta) / "plano.dwg"
        salida = Path(carpeta) / "plano.dxf"
        entrada.write_bytes(contenido)
        try:
            # dwg2dxf avisa por stderr y a veces termina con código distinto de 0
            # aunque haya escrito el DXF: lo que manda es que el archivo exista
            subprocess.run(
                [ruta, "-y", "-o", str(salida), str(entrada)],
                capture_output=True,
                timeout=TIEMPO_MAXIMO_S,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise DwgIlegible("La conversión del DWG tardó demasiado. Guárdalo como DXF en AutoCAD y cárgalo.") from exc
        if not salida.exists() or salida.stat().st_size == 0:
            raise DwgIlegible(
                "No se pudo convertir el DWG (puede ser una versión de AutoCAD no admitida). "
                "Guárdalo como DXF en AutoCAD y cárgalo."
            )
        return salida.read_bytes()
