"""
Punto de entrada del backend principal de SolarQuote.

Arranque en local:
    uvicorn app.main:app --reload

Documentación interactiva:
    http://localhost:8000/docs
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import auth, health

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="API del sistema de cotización de estructuras fotovoltaicas — HEXtructure S.A.S.",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ─── CORS ───────────────────────────────────────────────
# Permite que el frontend (otro dominio) consuma esta API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Rutas ──────────────────────────────────────────────
app.include_router(health.router)
app.include_router(auth.router, prefix="/api/auth", tags=["Autenticación"])

# A medida que avancemos, cada módulo registra su router aquí:
# app.include_router(layout.router,     prefix="/api/layout",    tags=["Módulo 1 — Layout"])
# app.include_router(boceto.router,     prefix="/api/boceto",    tags=["Módulo 2 — Boceto"])
# app.include_router(cotizacion.router, prefix="/api/cotizacion",tags=["Módulo 3 — Cotización"])
# app.include_router(admin.router,      prefix="/api/admin",     tags=["Módulo 4 — Administración"])
# app.include_router(validacion.router, prefix="/api/validacion",tags=["Módulo 5 — Validación"])


@app.get("/", tags=["Diagnóstico"])
def root() -> dict:
    return {
        "mensaje": f"{settings.APP_NAME} v{settings.APP_VERSION}",
        "documentacion": "/docs",
    }
