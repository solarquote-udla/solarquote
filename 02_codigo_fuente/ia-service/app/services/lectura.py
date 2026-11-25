"""
Qué lector usa cada formato de boceto — RF-04.

- DXF: geometría (dxf.py), sin IA.
- DWG: se convierte a DXF con LibreDWG (dwg.py) y se lee como un DXF.
- PDF: primero la geometría (pdf_vectorial.py), exacta cuando el PDF viene de
  CAD; si no trae paneles como vectores (escaneo, plano girado), la IA con el
  PDF convertido en imágenes (ia.py + mosaico.py).
- PNG y JPG: la IA.

Lo usan el endpoint y el evaluador (scripts/evaluar_ia.py), para que midan
exactamente lo mismo.
"""

from app.schemas.boceto import ResultadoInterpretacion
from app.services.dwg import dwg_a_dxf
from app.services.dxf import interpretar_dxf
from app.services.ia import interpretar_con_ia
from app.services.pdf_vectorial import interpretar_pdf_vectorial


def interpretar_boceto(contenido: bytes, formato: str) -> ResultadoInterpretacion:
    if formato == "dxf":
        return interpretar_dxf(contenido)
    if formato == "dwg":
        return interpretar_dxf(dwg_a_dxf(contenido)).model_copy(update={"formato": "dwg"})
    if formato == "pdf":
        resultado = interpretar_pdf_vectorial(contenido)
        if resultado is not None:
            return resultado
    return interpretar_con_ia(contenido, formato)
