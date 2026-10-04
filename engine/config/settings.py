from __future__ import annotations

from functools import lru_cache
from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="ENGINE_", extra="ignore")

    env: str = "development"
    host: str = "0.0.0.0"
    port: int = Field(default=8000, ge=1, le=65535)
    api_key: str | None = None
    storage_root: str = "./storage-data"
    database_path: str = "./storage-data/engine.db"
    max_upload_bytes: int = Field(default=25 * 1024 * 1024, ge=1)
    max_output_bytes: int = Field(default=50 * 1024 * 1024, ge=1)
    job_timeout_seconds: int = Field(default=300, ge=1)
    max_concurrency: int = Field(default=2, ge=1, le=32)
    retention_hours: int = Field(default=24, ge=1)
    cleanup_interval_seconds: int = Field(default=3600, ge=10)
    webhook_timeout_seconds: int = Field(default=10, ge=1)
    webhook_retries: int = Field(default=3, ge=1, le=10)
    webhook_secret: str = "change-me-in-production"
    webhook_allow_private: bool = False
    webhook_require_https: bool = False
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]
    log_level: str = "INFO"

    @model_validator(mode="after")
    def validate_production_security(self):
        if self.env.lower() in {"production", "prod"}:
            if not self.api_key or len(self.api_key) < 32:
                raise ValueError("ENGINE_API_KEY must be a high-entropy value of at least 32 characters in production")
            if not self.webhook_secret or self.webhook_secret == "change-me-in-production" or len(self.webhook_secret) < 32:
                raise ValueError("ENGINE_WEBHOOK_SECRET must be a high-entropy value of at least 32 characters in production")
            object.__setattr__(self, "webhook_require_https", True)
        return self

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_origins(cls, value):
        if isinstance(value, str):
            return [v.strip() for v in value.split(",") if v.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
