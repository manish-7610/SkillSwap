from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # App
    APP_NAME: str = "SkillSwap API"
    APP_VERSION: str = "1.0.0"
    # Production-safe default: DEBUG=False.
    # Set DEBUG=True in your local .env file during development.
    DEBUG: bool = False
    ALLOWED_ORIGINS: str = "http://localhost:5500,http://127.0.0.1:5500"

    # Database
    # Must be provided via .env or environment variable — no insecure default.
    # Example (Supabase Session Pooler):
    #   postgresql+psycopg://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
    DATABASE_URL: str = ""

    # JWT
    # Must be provided via .env — no insecure default.
    # Generate with: python -c "import secrets; print(secrets.token_hex(32))"
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Fail fast with a clear error rather than silently running
        # with an empty secret or missing database URL.
        if not self.SECRET_KEY:
            raise ValueError(
                "SECRET_KEY is not set. "
                "Add SECRET_KEY=<your-secret> to your .env file. "
                "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        if not self.DATABASE_URL:
            raise ValueError(
                "DATABASE_URL is not set. "
                "Add DATABASE_URL=postgresql+psycopg://user:pass@host:5432/db to your .env file."
            )

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
