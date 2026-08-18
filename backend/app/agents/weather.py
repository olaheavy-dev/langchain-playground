"""Tool-calling agent: the model decides when to call our own functions."""

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import httpx
from langchain.agents import create_agent
from langchain.tools import ToolRuntime, tool
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import InMemorySaver

from app.agents.base import get_model
from app.schemas import WeatherResponse

SYSTEM_PROMPT = (
    'You are a helpful weather assistant, who always cracks jokes and is '
    'humorous while remaining helpful.'
)


@dataclass
class Context:
    """Per-request data the tools can read but the model cannot see."""

    user_id: str


@tool('get_weather', return_direct=False, description='Return weather information for a given city.')
async def get_weather(city: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(f'https://wttr.in/{city}?format=j1')
        response.raise_for_status()
        return response.json()


@tool('locate_user', description="Look up a user's city based on their context")
def locate_user(runtime: ToolRuntime[Context]) -> str:
    match runtime.context.user_id:
        case 'ABC123':
            return 'Vienna'
        case 'XYZ456':
            return 'London'
        case 'HJKL111':
            return 'Paris'
        case _:
            return 'Unknown'


@lru_cache
def _get_agent():
    """Built once on first use rather than at import, so the module can be
    imported without an API key present."""
    return create_agent(
        model=get_model(temperature=0.3),
        tools=[get_weather, locate_user],
        system_prompt=SYSTEM_PROMPT,
        context_schema=Context,
        response_format=WeatherResponse,
        # In-process memory: fine for development, but conversations are lost on
        # restart and are not shared across workers. Swap for a database-backed
        # checkpointer before running more than one process.
        checkpointer=InMemorySaver(),
    )


async def ask_weather_agent(user_id: str, thread_id: str) -> WeatherResponse:
    config: RunnableConfig = {'configurable': {'thread_id': thread_id}}
    response = await _get_agent().ainvoke(
        {
            'messages': [
                {
                    'role': 'user',
                    'content': 'What is the weather like where I am?',
                },
            ],
        },
        config=config,
        context=Context(user_id=user_id),
    )
    return response['structured_response']
