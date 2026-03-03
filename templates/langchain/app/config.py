from dotenv import load_dotenv
from pydantic import field_validator
from pydantic_settings import BaseSettings

load_dotenv(dotenv_path=".env", override=False)


class Settings(BaseSettings):
    # Arcade
    arcade_gateway_url: str = ""

    # LLM
    openai_api_key: str = ""
    anthropic_api_key: str = ""

    # App
    app_url: str = "http://localhost:8765"
    app_secret_key: str = "change-me-to-a-random-string"

    # Database
    database_url: str = "sqlite+aiosqlite:///local.db"

    # Custom verifier (optional — requires ARCADE_API_KEY)
    arcade_custom_verifier: bool = False
    arcade_api_key: str = ""

    @field_validator(
        "arcade_gateway_url", "openai_api_key", "anthropic_api_key", "arcade_api_key", mode="before"
    )
    @classmethod
    def strip_env_comments(cls, v: str) -> str:
        """Strip inline comments that python-dotenv may leave in values."""
        v = v.strip()
        if v.startswith("#"):
            return ""
        return v

    @field_validator("database_url", mode="before")
    @classmethod
    def coerce_database_url(cls, v: str) -> str:
        """Fall back to default SQLite URL if env var is unset, blank, or not a valid URL."""
        v = (v or "").strip()
        if not v or "://" not in v:
            return "sqlite+aiosqlite:///local.db"
        return v

    @field_validator("app_url")
    @classmethod
    def ensure_app_url_has_scheme(cls, v: str) -> str:
        v = v.rstrip("/")
        if not v.startswith(("http://", "https://")):
            v = f"http://{v}"
        return v

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
