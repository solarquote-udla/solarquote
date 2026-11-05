"""PDF vectoriales sintéticos para las pruebas (como los que exporta AutoCAD), con medidas conocidas."""

# Panel en puntos PDF, con la misma proporción que en el boceto real (≈ 6,36 × 3,0)
LARGO, CORTO = 6.36, 3.0
HUECO = 0.12


def _pdf(contenidos: list[str], ancho: float = 842, alto: float = 1191) -> bytes:
    """Un PDF válido con una página por contenido (operadores de dibujo en texto)."""
    objetos: list[bytes] = []
    n = len(contenidos)
    kids = " ".join(f"{3 + 2 * i} 0 R" for i in range(n))
    objetos.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objetos.append(f"<< /Type /Pages /Kids [{kids}] /Count {n} >>".encode())
    for i, contenido in enumerate(contenidos):
        flujo = contenido.encode()
        objetos.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {ancho} {alto}] /Contents {4 + 2 * i} 0 R >>".encode()
        )
        objetos.append(f"<< /Length {len(flujo)} >>\nstream\n".encode() + flujo + b"\nendstream")
    salida = bytearray(b"%PDF-1.7\n")
    posiciones = []
    for numero, cuerpo in enumerate(objetos, start=1):
        posiciones.append(len(salida))
        salida += f"{numero} 0 obj\n".encode() + cuerpo + b"\nendobj\n"
    xref = len(salida)
    salida += f"xref\n0 {len(objetos) + 1}\n0000000000 65535 f \n".encode()
    for p in posiciones:
        salida += f"{p:010d} 00000 n \n".encode()
    salida += f"trailer\n<< /Size {len(objetos) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(salida)


def _panel(x: float, y: float, como: str, largo: float = LARGO, corto: float = CORTO) -> str:
    if como == "re":
        return f"{x:.2f} {y:.2f} {largo:.2f} {corto:.2f} re S\n"
    # polilínea cerrada, como en el PDF real (con un remate corto al final)
    return (
        f"{x:.2f} {y:.2f} m {x + largo:.2f} {y:.2f} l {x + largo:.2f} {y + corto:.2f} l "
        f"{x:.2f} {y + corto:.2f} l {x:.2f} {y:.2f} l {x:.2f} {y - HUECO:.2f} l S\n"
    )


def pagina(bloques: list[tuple[float, float, int, int]], como: str = "re", largo: float = LARGO, corto: float = CORTO) -> str:
    """`bloques`: (x0, y0, L, A). L paneles a lo largo de X (lado mayor), A filas hacia arriba."""
    trazos = ["0.58 0.58 0.6 RG 0.72 w\n", "1 0 0 RG 50 50 700 1000 re S 0.58 0.58 0.6 RG\n"]  # contorno del terreno
    for x0, y0, L, A in bloques:
        for i in range(L):
            for j in range(A):
                trazos.append(_panel(x0 + i * (largo + HUECO), y0 + j * (corto + HUECO), como, largo, corto))
    return "".join(trazos)


def crear_pdf(*paginas: str) -> bytes:
    return _pdf(list(paginas))
