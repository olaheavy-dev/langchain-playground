from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import copilot, weather

settings = get_settings()

app = FastAPI(
    title='LangChain Playground API',
    description='Three LangChain patterns: a tool-calling agent, a chat model, and a streaming chat model.',
    version='0.1.0',
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


@app.get('/health', tags=['health'])
async def health() -> dict[str, str]:
    return {'status': 'ok'}
