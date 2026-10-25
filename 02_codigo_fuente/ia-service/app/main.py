from fastapi import FastAPI

from app.core.config import settings
from app.routers import bocetos, health, varillas

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Interpretación de bocetos (RF-04) y conteo de varillas (RF-14) — HEXtructure S.A.S.",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Sin CORS: el navegador nunca llama a este servicio, solo la API principal.
app.include_router(health.router)
app.include_router(bocetos.router)
app.include_router(varillas.router)


@app.get("/", tags=["Diagnóstico"])
def root() -> dict:
    return {"mensaje": f"{settings.APP_NAME} v{settings.APP_VERSION}", "documentacion": "/docs"}
