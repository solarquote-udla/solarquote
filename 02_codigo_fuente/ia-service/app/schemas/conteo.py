"""Contrato del conteo de varillas — RF-14."""

from pydantic import BaseModel, Field

MAXIMO_VARILLAS = 100_000


class ResultadoConteo(BaseModel):
    """
    Extremos de varilla visibles en la foto. Es una estimación: el operario
    la revisa y la corrige antes de confirmar el despacho.
    """

    cantidad: int = Field(ge=0, le=MAXIMO_VARILLAS)
    confianza: float = Field(ge=0, le=1)
    advertencias: list[str] = Field(default_factory=list)
