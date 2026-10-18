"""Normalización de texto compartida entre schemas (Pydantic `BeforeValidator`)."""


def colapsar_espacios(valor: object) -> object:
    """Colapsa espacios repetidos y recorta los extremos. No toca valores que no sean str."""
    return " ".join(valor.split()) if isinstance(valor, str) else valor


def escapar_comodines_ilike(texto: str) -> str:
    """
    Escapa `\\`, `%` y `_` para usar `texto` dentro de un patrón ILIKE
    como texto literal. Sin esto, un `buscar` que por casualidad trae un
    `_` (frecuente en nombres de archivo o códigos) hace de comodín de
    un carácter y amplía el resultado más de lo que el usuario buscaba.
    """
    return texto.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
