from pydantic_settings import BaseSettings
from functools import lru_cache

_DEV_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

_DEFAULT_JWT_SECRET = "dev-secret-change-in-production"
_DEFAULT_REFRESH_SECRET = "dev-refresh-secret-change-in-production"


class Settings(BaseSettings):
    jwt_secret_key: str = _DEFAULT_JWT_SECRET
    jwt_refresh_secret_key: str = _DEFAULT_REFRESH_SECRET
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 7

    supabase_url: str = ""
    supabase_service_key: str = ""

    cors_origins: str = ",".join(_DEV_ORIGINS)
    app_env: str = "development"
    production_frontend_url: str = ""

    # Email / SMTP — used for password reset
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@auralis.ai"
    frontend_url: str = "http://localhost:5173"

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_user and self.smtp_password)

    @property
    def cors_origins_list(self) -> list[str]:
        if self.is_production:
            if self.production_frontend_url:
                return [self.production_frontend_url.rstrip("/")]
            return [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        parsed = [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        for origin in _DEV_ORIGINS:
            if origin not in parsed:
                parsed.append(origin)
        return parsed

    def validate_production(self) -> None:
        if not self.is_production:
            return
        if self.jwt_secret_key == _DEFAULT_JWT_SECRET:
            raise RuntimeError(
                "FATAL: JWT_SECRET_KEY is set to the default dev value in production."
            )
        if self.jwt_refresh_secret_key == _DEFAULT_REFRESH_SECRET:
            raise RuntimeError(
                "FATAL: JWT_REFRESH_SECRET_KEY is set to the default dev value in production."
            )
        if not self.supabase_url or not self.supabase_service_key:
            raise RuntimeError(
                "FATAL: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in production."
            )

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.validate_production()
    return s
