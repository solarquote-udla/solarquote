from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.routers import cotizacion, health

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Servicio de cálculo de materiales y generación de cotizaciones — HEXtructure S.A.S.",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(cotizacion.router)


@app.get("/", tags=["Diagnóstico"])
def root() -> dict:
    return {
        "mensaje": f"{settings.APP_NAME} v{settings.APP_VERSION}",
        "documentacion": "/docs",
    }
