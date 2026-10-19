from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(tags=["Diagnóstico"])


@router.get("/health")
def health_check() -> dict:
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        # Sin exponer la clave: solo si está configurada
        "ia_configurada": bool(settings.ANTHROPIC_API_KEY),
    }
