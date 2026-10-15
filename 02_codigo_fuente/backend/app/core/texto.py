"""Normalización de texto compartida entre schemas (Pydantic `BeforeValidator`)."""


def colapsar_espacios(valor: object) -> object:
    """Colapsa espacios repetidos y recorta los extremos. No toca valores que no sean str."""
    return " ".join(valor.split()) if isinstance(valor, str) else valor
