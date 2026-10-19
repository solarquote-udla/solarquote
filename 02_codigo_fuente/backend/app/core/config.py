"""
Configuración central de la aplicación.

Lee las variables desde el archivo .env y las expone como un objeto `settings`
tipado. Si falta una variable obligatoria, la app falla al arrancar en vez de
romperse a mitad de una petición.
"""

import re
from decimal import Decimal
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
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

    # Solo para pytest (ver tests/conftest.py). La app nunca la usa. Se
    # declara aquí para que pueda vivir en el .env junto a DATABASE_URL:
    # pydantic-settings solo lee del .env los campos declarados.
    TEST_DATABASE_URL: str | None = None

    # ─── Seguridad / JWT ────────────────────────────────
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 8  # 8 horas

    # Bloqueo temporal de la cuenta tras intentos fallidos de login
    MAX_INTENTOS_LOGIN: int = Field(default=5, ge=1)
    MINUTOS_BLOQUEO_LOGIN: int = Field(default=15, ge=1)

    # ─── CORS ───────────────────────────────────────────
    # Orígenes permitidos, separados por coma en el .env
    CORS_ORIGINS: str = "http://localhost:5173"

    # Opcional. Acepta además los orígenes que calcen COMPLETOS con este
    # patrón (Starlette usa fullmatch). Sirve para las URLs de preview de
    # Vercel, que cambian en cada despliegue. Ver DESPLIEGUE.md.
    CORS_ORIGIN_REGEX: str | None = None

    @field_validator("CORS_ORIGIN_REGEX")
    @classmethod
    def _validar_regex_cors(cls, valor: str | None) -> str | None:
        """Un patrón mal escrito debe tumbar el arranque, no fallar en silencio."""
        if valor is None or not valor.strip():
            return None
        try:
            re.compile(valor)
        except re.error as error:
            raise ValueError(f"CORS_ORIGIN_REGEX no es un patrón válido: {error}") from error
        return valor.strip()

    # ─── Microservicios ─────────────────────────────────
    IA_SERVICE_URL: str = "http://localhost:8001"
    CALC_SERVICE_URL: str = "http://localhost:8002"

    # DS-05: secreto compartido con calc-service (mismo valor en los dos
    # .env). Sin default a propósito, igual que SECRET_KEY.
    CALC_SERVICE_SECRET: str

    # Secreto compartido con ia-service (RF-04), mismo valor en los dos
    # servicios. Opcional: sin él, cargar un boceto responde 503 y el
    # resto de la API funciona igual.
    IA_SERVICE_SECRET: str | None = None

    # ─── Cotización (RF-06) ─────────────────────────────
    # calc-service no asume ninguna tasa: la resuelve este valor y se la
    # manda en cada request a /api/cotizacion/calcular.
    IVA_PORCENTAJE: Decimal = Field(default=Decimal("15"), ge=0, le=100)

    # Numeración de proformas: PREFIJO-NNN-AAAA (prototipo: CT-130-2026),
    # correlativa por año. PRIMER_NUMERO permite continuar la numeración
    # que HEXtructure ya lleva a mano: si este año van por la 129, se
    # configura 130 y el sistema sigue desde ahí.
    PROFORMA_PREFIJO: str = Field(default="CT", min_length=1, max_length=6, pattern=r"^[A-Z]+$")
    PROFORMA_PRIMER_NUMERO: int = Field(default=1, ge=1)

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
