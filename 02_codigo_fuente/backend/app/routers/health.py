"""
Endpoints de diagnóstico.

Sirven para verificar que la API está viva y que la conexión a la base de
datos funciona. Railway los usa como health check del despliegue.
"""

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db

router = APIRouter(tags=["Diagnóstico"])

TIMEOUT_SEGUNDOS_SERVICIOS = 5.0


@router.get("/health")
def health_check() -> dict:
    """Verifica que la API responde."""
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
    }


@router.get("/health/db")
def database_health_check(db: Session = Depends(get_db)) -> dict:
    """Verifica que la conexión a PostgreSQL funciona."""
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "conectada"}
    except Exception as exc:
        return {"status": "error", "database": "sin conexión", "detalle": str(exc)}


def _estado_servicio(url: str) -> str:
    """Golpea el /health de un servicio por la red interna de Railway (RNF-06)."""
    try:
        respuesta = httpx.get(f"{url}/health", timeout=TIMEOUT_SEGUNDOS_SERVICIOS)
    except httpx.RequestError:
        return "caído"
    return "ok" if respuesta.status_code == 200 else "caído"


@router.get("/health/servicios")
def servicios_health_check() -> dict:
    """Verifica calc-service e ia-service, que no tienen dominio público.

    Permite que un monitor externo (solo ve al backend) cubra también a
    los otros dos servicios, consultándolos aquí por la red interna.
    """
    return {
        "calc_service": _estado_servicio(settings.CALC_SERVICE_URL),
        "ia_service": _estado_servicio(settings.IA_SERVICE_URL),
    }
