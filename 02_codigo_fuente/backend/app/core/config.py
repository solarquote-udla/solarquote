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

    # ─── Datos del oferente para el documento de la proforma (RF-07) ───
    # Se cargan del .env local o de las variables de Railway, nunca con
    # un valor por defecto en el código: el repositorio es público. Un
    # campo vacío simplemente no aparece en el documento (ver
    # services/documentos.py), así que el arranque no depende de ellos.
    HEXTRUCTURE_RAZON_SOCIAL: str = ""
    HEXTRUCTURE_ACTIVIDAD: str = ""
    HEXTRUCTURE_RUC: str = ""
    HEXTRUCTURE_TELEFONO: str = ""
    HEXTRUCTURE_CORREO: str = ""
    HEXTRUCTURE_DIRECCION: str = ""
    HEXTRUCTURE_REPRESENTANTE: str = ""
    HEXTRUCTURE_CARGO_REPRESENTANTE: str = ""
    HEXTRUCTURE_BANCO: str = ""
    HEXTRUCTURE_BANCO_TIPO_CUENTA: str = ""
    HEXTRUCTURE_BANCO_NUMERO_CUENTA: str = ""
    HEXTRUCTURE_BANCO_TITULAR: str = ""

    # ─── Condiciones comerciales de la proforma (RF-07) ─────────────────
    # A diferencia de los datos del oferente, esto no es sensible: son
    # las condiciones comerciales de HEXtructure, no datos de contacto o
    # de la cuenta bancaria. Van con un valor por defecto, configurable
    # después si cambian (proforma de referencia: CT-129-2025).
    PROFORMA_CONCEPTO: str = "Estructura de soporte reusable para la instalación en piso de módulos fotovoltaicos"
    PROFORMA_PLAZO_DIAS: int = Field(default=20, ge=1)
    PROFORMA_VALIDEZ_DIAS: int = Field(default=90, ge=1)
    PROFORMA_GARANTIA_ANIOS: int = Field(default=1, ge=1)

    # Forma de pago: tres porcentajes sobre el total que deben sumar 100.
    PROFORMA_PAGO_ANTICIPO_PCT: Decimal = Field(default=Decimal("30"), ge=0, le=100)
    PROFORMA_PAGO_ENTREGA_PCT: Decimal = Field(default=Decimal("40"), ge=0, le=100)
    PROFORMA_PAGO_60_DIAS_PCT: Decimal = Field(default=Decimal("30"), ge=0, le=100)

    # Notas fijas del documento. La lista de L/A/bloques de cada ítem se
    # agrega aparte, debajo de la primera.
    PROFORMA_NOTAS: tuple[str, ...] = (
        "Las cantidades se calcularon en base al diseño de bloques configurados por el cliente.",
        "Las estructuras se entregarán en bodegas de HEXtructure S.A.S. – Ibarra.",
        "El plazo corre a partir de la fecha del anticipo y hoja técnica del panel a usar.",
    )

    @field_validator("PROFORMA_PAGO_60_DIAS_PCT")
    @classmethod
    def _validar_porcentajes_de_pago(cls, valor: Decimal, info) -> Decimal:
        """Los tres porcentajes de la forma de pago deben sumar 100, igual que en la proforma real."""
        anticipo = info.data.get("PROFORMA_PAGO_ANTICIPO_PCT")
        entrega = info.data.get("PROFORMA_PAGO_ENTREGA_PCT")
        if anticipo is not None and entrega is not None and anticipo + entrega + valor != 100:
            raise ValueError(
                f"Los porcentajes de pago deben sumar 100 (anticipo {anticipo} + entrega {entrega} + 60 días {valor})"
            )
        return valor

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
