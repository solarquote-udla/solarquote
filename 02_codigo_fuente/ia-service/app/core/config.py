from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    APP_NAME: str = "SolarQuote IA Service"
    APP_VERSION: str = "0.1.0"
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    DEBUG: bool = True

    # Igual que calc-service (DS-05): solo la API principal puede llamar a
    # este servicio. Sin default a propósito: que falte tumba el arranque
    # en vez de dejar el endpoint abierto.
    IA_SERVICE_SECRET: str

    # Sin clave el servicio arranca igual: los DXF no la necesitan. Los PDF
    # e imágenes responden 503 hasta que se configure.
    ANTHROPIC_API_KEY: str | None = None
    ANTHROPIC_MODEL: str = "claude-sonnet-5-5"
    ANTHROPIC_URL: str = "https://api.anthropic.com/v1/messages"
    ANTHROPIC_TIMEOUT_SEGUNDOS: float = Field(default=120, gt=0)

    # RF-04: tamaño máximo del boceto
    TAMANO_MAXIMO_BYTES: int = 10 * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
