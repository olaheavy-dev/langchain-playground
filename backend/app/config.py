from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, read from the environment or a .env file."""

    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    openai_api_key: str
    model_name: str = 'gpt-4.1-mini'
    embedding_model_name: str = 'text-embedding-3-large'
    cors_origins: list[str] = ['http://localhost:3000']
    # Every /api route costs money, so an unauthenticated deployment needs a cap.
    rate_limit_per_minute: int = 20
    # Embed the knowledge base at startup rather than during the first search.
    # Worth turning off for a reload-driven dev loop, where it is paid on every
    # restart for a corpus that has not changed.
    warm_knowledge_base: bool = True
    log_level: str = 'INFO'


@lru_cache
def get_settings() -> Settings:
    """Cached so the .env file is only read once per process."""
    return Settings()  # pyright: ignore[reportCallIssue]  # values come from the environment
