"""
Configuración central de la aplicación.

Lee las variables desde el archivo .env y las expone como un objeto `settings`
tipado. Si falta una variable obligatoria, la app falla al arrancar en vez de
romperse a mitad de una petición.
"""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ─── Aplicación ─────────────────────────────────────
    APP_NAME: str = "SolarQuote API"
    APP_VERSION: str = "0.1.0"
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    DEBUG: bool = True

    # ─── Base de datos ──────────────────────────────────
    # Formato: postgresql://usuario:password@host/basededatos
    DATABASE_URL: str

    # ─── Seguridad / JWT ────────────────────────────────
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 8  # 8 horas

    # ─── CORS ───────────────────────────────────────────
    # Orígenes permitidos, separados por coma en el .env
    CORS_ORIGINS: str = "http://localhost:5173"

    # ─── Microservicios ─────────────────────────────────
    IA_SERVICE_URL: str = "http://localhost:8001"
    CALC_SERVICE_URL: str = "http://localhost:8002"

    @property
    def cors_origins_list(self) -> list[str]:
        """Convierte el string de orígenes en una lista."""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """
    Devuelve la configuración. El decorador @lru_cache hace que el archivo .env
    se lea una sola vez, no en cada petición.
    """
    return Settings()


settings = get_settings()
