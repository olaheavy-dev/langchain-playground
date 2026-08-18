from functools import lru_cache

from langchain.chat_models import init_chat_model

from app.config import get_settings


@lru_cache
def get_model(temperature: float):
    """Shared chat model factory.

    The API key is passed explicitly rather than left to the environment:
    pydantic-settings reads .env into the Settings object, but does not export
    the values into os.environ where LangChain would otherwise look for them.
    """
    settings = get_settings()
    return init_chat_model(
        settings.model_name,
        temperature=temperature,
        api_key=settings.openai_api_key,
    )
