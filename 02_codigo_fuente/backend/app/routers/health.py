"""
Endpoints de diagnóstico.

Sirven para verificar que la API está viva y que la conexión a la base de
datos funciona. Railway los usa como health check del despliegue.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db

router = APIRouter(tags=["Diagnóstico"])


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
