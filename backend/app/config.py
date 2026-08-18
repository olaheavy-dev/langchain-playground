from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, read from the environment or a .env file."""

    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    openai_api_key: str
    model_name: str = 'gpt-4.1-mini'
    cors_origins: list[str] = ['http://localhost:3000']


@lru_cache
def get_settings() -> Settings:
    """Cached so the .env file is only read once per process."""
    return Settings()  # pyright: ignore[reportCallIssue]  # values come from the environment
