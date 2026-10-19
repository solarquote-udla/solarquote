"""Dependencias reutilizables de FastAPI."""

import hmac

from fastapi import Header, HTTPException, status

from app.core.config import settings


def requiere_secreto_compartido(x_internal_secret: str | None = Header(default=None)) -> None:
    """
    Servicio interno: solo la API principal lo llama, con el secreto
    compartido en X-Internal-Secret. `compare_digest` evita filtrar el
    secreto por el tiempo de respuesta.
    """
    if x_internal_secret is None or not hmac.compare_digest(x_internal_secret, settings.IA_SERVICE_SECRET):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Falta o es inválido el secreto compartido",
        )
