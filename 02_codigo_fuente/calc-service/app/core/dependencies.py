"""Dependencias reutilizables de FastAPI."""

import hmac

from fastapi import Header, HTTPException, status

from app.core.config import settings


def requiere_secreto_compartido(x_internal_secret: str | None = Header(default=None)) -> None:
    """
    DS-05: calc-service es un servicio interno, solo el backend principal
    debe poder llamarlo. Compara con `hmac.compare_digest` en vez de `==`
    para no filtrar el secreto por tiempo de respuesta.
    """
    if x_internal_secret is None or not hmac.compare_digest(x_internal_secret, settings.CALC_SERVICE_SECRET):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Falta o es inválido el secreto compartido",
        )
