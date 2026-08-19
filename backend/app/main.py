import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agents.rag import get_store
from app.config import get_settings
from app.rate_limit import RateLimitMiddleware
from app.routers import copilot, rag, weather

logger = logging.getLogger(__name__)

settings = get_settings()

# Without this the application's own log lines are invisible in a deployment:
# uvicorn configures its own loggers and leaves the root logger alone, so
# anything below WARNING from this package is dropped. That would have silently
# hidden the warming confirmation below, and made "kb_search failed" quieter
# than it deserves.
logging.basicConfig(
    level=settings.log_level.upper(),
    format='%(levelname)s:     %(name)s - %(message)s',
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Embed the knowledge base before the first request rather than during it.

    Built lazily, the first search paid for embedding the whole corpus: 2.7s
    against 200ms for every search after it. That cost does not disappear by
    moving it, but it moves somewhere better -- startup happens before a health
    check passes, so a platform holds traffic until the work is done, and with
    scale-to-zero it is the machine waking rather than a visitor waiting.

    Deliberately not fatal. A failure here would take down the weather agent and
    both copilots, none of which need the vector store, so it is logged and the
    first search falls back to building it lazily as before.
    """
    if settings.warm_knowledge_base:
        try:
            # In a thread: embedding is a blocking call, and running it here
            # directly would stall the event loop for its whole duration.
            await asyncio.to_thread(get_store)
            logger.info('knowledge base ready')
        except Exception:
            logger.exception('could not warm the knowledge base; it will be built on first use')

    yield


app = FastAPI(
    title='LangChain Playground API',
    description='Three LangChain patterns: a tool-calling agent, a chat model, and a streaming chat model.',
    version='0.1.0',
    lifespan=lifespan,
)

app.add_middleware(
    RateLimitMiddleware,
    limit=settings.rate_limit_per_minute,
    window_seconds=60.0,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(weather.router)
app.include_router(copilot.router)
app.include_router(rag.router)


@app.get('/health', tags=['health'])
async def health() -> dict[str, str]:
    return {'status': 'ok'}
