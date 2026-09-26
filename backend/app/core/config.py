"""Application settings (Pydantic Settings). Variables mirror backend.md §15."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_ENV: Literal["development", "staging", "production"] = "development"
    SECRET_KEY: str = Field(default="dev-only-insecure-secret-change-me", min_length=16)
    FRONTEND_ORIGIN: str = "http://localhost:5173"

    DATABASE_URL: str = "postgresql+asyncpg://stocksense:stocksense@localhost:5432/stocksense"
    REDIS_URL: str = "redis://localhost:6379/0"

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    EMAIL_PROVIDER: Literal["sendgrid", "smtp"] = "smtp"
    SENDGRID_API_KEY: str = ""
    EMAIL_FROM: str = "StockSense <no-reply@stocksense.local>"

    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 1025

    OTP_REQUEST_RATE_PER_HOUR: int = 3
    LOGIN_RATE_PER_15_MIN: int = 10

    # Constants fixed by the architecture (not environment-driven).
    JWT_ALGORITHM: str = "HS256"
    OTP_EXPIRE_MINUTES: int = 10
    OTP_MAX_ATTEMPTS: int = 5
    RESET_TOKEN_EXPIRE_MINUTES: int = 15
    BCRYPT_ROUNDS: int = 12
    REFRESH_COOKIE_NAME: str = "ss_refresh"
    REFRESH_COOKIE_PATH: str = "/api/v1/auth"

    @field_validator("DATABASE_URL")
    @classmethod
    def _force_asyncpg(cls, v: str) -> str:
        # Render hands out postgres:// or postgresql:// URLs; the app needs the asyncpg driver.
        if v.startswith("postgres://"):
            v = "postgresql://" + v[len("postgres://") :]
        if v.startswith("postgresql://"):
            v = "postgresql+asyncpg://" + v[len("postgresql://") :]
        return v

    @model_validator(mode="after")
    def _production_guards(self) -> "Settings":
        if self.APP_ENV == "production":
            if self.SECRET_KEY.startswith("dev-only") or len(self.SECRET_KEY) < 32:
                raise ValueError("SECRET_KEY must be a strong secret (>= 32 chars) in production")
            if "*" in self.FRONTEND_ORIGIN:
                raise ValueError("Wildcard FRONTEND_ORIGIN is not allowed in production")
            if self.EMAIL_PROVIDER == "sendgrid" and not self.SENDGRID_API_KEY:
                raise ValueError("SENDGRID_API_KEY is required when EMAIL_PROVIDER=sendgrid")
        return self

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.FRONTEND_ORIGIN.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
