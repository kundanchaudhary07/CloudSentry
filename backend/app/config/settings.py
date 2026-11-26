from functools import lru_cache
from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "CloudSentry API"
    app_env: str = "development"
    api_v1_prefix: str = "/api/v1"
    log_level: str = "INFO"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])
    database_url: str = "postgresql+psycopg://cloudsentry:cloudsentry@localhost:5432/cloudsentry"
    aws_region: str = Field(
        default="us-east-1",
        validation_alias=AliasChoices("AWS_DEFAULT_REGION", "AWS_REGION"),
    )
    aws_regions: str = ""
    aws_enable_cost_explorer: bool = True
    app_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24
    frontend_url: str = "http://localhost:8080"
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str = "http://localhost:8000/api/v1/auth/oauth/google/callback"

    @model_validator(mode="after")
    def require_production_secret(self) -> "Settings":
        if self.app_env.strip().lower() in {"prod", "production"} and (
            self.app_secret_key == "change-me-in-production"
            or len(self.app_secret_key) < 32
        ):
            raise ValueError("APP_SECRET_KEY must be configured with at least 32 characters in production.")
        return self

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
