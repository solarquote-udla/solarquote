"""
Reconocimiento del formato del archivo por su contenido, no por el nombre.

La extensión la elige el usuario y puede mentir; los primeros bytes no.
"""


class FormatoNoAdmitido(ValueError):
    """El archivo no es PDF, PNG, JPG, DXF ni DWG."""


def detectar_formato(contenido: bytes) -> str:
    if contenido.startswith(b"%PDF-"):
        return "pdf"
    if contenido.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if contenido.startswith(b"\xff\xd8\xff"):
        return "jpg"
    # DWG de AutoCAD: "AC10" y la versión (AC1032 = AutoCAD 2018); se
    # convierte a DXF antes de leerlo (services/dwg.py)
    if contenido.startswith(b"AC10") or contenido.startswith(b"AC1."):
        return "dwg"
    if contenido.startswith(b"AutoCAD Binary DXF"):
        return "dxf"
    # DXF de texto: empieza con el código de grupo 0 y la sección SECTION,
    # a veces precedido de comentarios (código 999) y espacios.
    inicio = contenido[:2048].decode("latin-1", errors="ignore")
    lineas = [l.strip() for l in inicio.splitlines() if l.strip()]
    for i in range(len(lineas) - 1):
        if lineas[i] == "0" and lineas[i + 1] == "SECTION":
            return "dxf"
        if lineas[i] not in ("999",) and not (i > 0 and lineas[i - 1] == "999"):
            break
    raise FormatoNoAdmitido("Formato no admitido. Carga un PDF, una imagen (JPG o PNG) o un plano de AutoCAD (DXF o DWG).")
