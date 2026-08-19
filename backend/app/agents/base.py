from functools import lru_cache

from langchain.chat_models import init_chat_model
from langchain_openai import OpenAIEmbeddings

from app.config import get_settings

# Every OpenAI client in the app is built here, and the reason is the same in
# both cases: pydantic-settings reads .env into the Settings object but does not
# export it into os.environ, which is the only place the OpenAI SDK looks. A
# client constructed anywhere else will raise "Missing credentials" -- an error
# that points at the key rather than at the plumbing, so it costs more to
# diagnose than it should. Go through these factories and it cannot happen.


@lru_cache
def get_model(temperature: float):
    """Shared chat model factory."""
    settings = get_settings()
    return init_chat_model(
        settings.model_name,
        temperature=temperature,
        api_key=settings.openai_api_key,
    )


@lru_cache
def get_embeddings() -> OpenAIEmbeddings:
    """Shared embedding model factory."""
    settings = get_settings()
    return OpenAIEmbeddings(
        model=settings.embedding_model_name,
        api_key=settings.openai_api_key,
    )
