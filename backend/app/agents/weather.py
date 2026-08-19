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
from app.agents.middleware import TracingMiddleware
from app.agents.timing import finish, start_collecting
from app.schemas import WeatherReply, WeatherResponse

SYSTEM_PROMPT = (
    'You are a helpful weather assistant, who always cracks jokes and is '
    'humorous while remaining helpful.\n\n'
    'Never state weather conditions from your own knowledge. You must call '
    'get_weather for the city and report only what it returns. If locate_user '
    'cannot place the user, or if get_weather fails, say so plainly and leave '
    'every reading empty rather than estimating one.'
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
        middleware=[TracingMiddleware()],
        checkpointer=InMemorySaver(),
    )


async def ask_weather_agent(user_id: str, thread_id: str) -> WeatherReply:
    """Run the agent and report both the reading and how long each step took.

    Every number in the trace is measured. What the model spends thinking is
    whatever is left once the tool calls are subtracted, which is why it is
    derived rather than timed directly -- there is no point in the loop where
    only the model is running that we can wrap.
    """
    started = start_collecting()

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
    reading: WeatherResponse = response['structured_response']
    return WeatherReply(**reading.model_dump(), trace=finish(started))
