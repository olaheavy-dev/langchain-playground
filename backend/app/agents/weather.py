"""Tool-calling agent: the model decides when to call our own functions."""

import time
from contextvars import ContextVar
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import httpx
from langchain.agents import create_agent
from langchain.tools import ToolRuntime, tool
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import InMemorySaver

from app.agents.base import get_model
from app.schemas import TraceSegment, WeatherReply, WeatherResponse

# Tool timings for the request currently being served. A ContextVar rather than
# a module global because concurrent requests share this module, and each needs
# its own list -- asyncio tasks inherit a copy rather than writing to one.
_tool_timings: ContextVar[list[TraceSegment]] = ContextVar('tool_timings')

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


def _record(label: str, started: float) -> None:
    """Note how long a step took, if anyone is collecting."""
    timings = _tool_timings.get(None)
    if timings is not None:
        timings.append(TraceSegment(label=label, ms=(time.perf_counter() - started) * 1000))


@tool('get_weather', return_direct=False, description='Return weather information for a given city.')
async def get_weather(city: str) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f'https://wttr.in/{city}?format=j1')
            response.raise_for_status()
            return response.json()
    finally:
        _record('get_weather', started)


@tool('locate_user', description="Look up a user's city based on their context")
def locate_user(runtime: ToolRuntime[Context]) -> str:
    started = time.perf_counter()
    try:
        return _locate(runtime.context.user_id)
    finally:
        _record('locate_user', started)


def _locate(user_id: str) -> str:
    match user_id:
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


async def ask_weather_agent(user_id: str, thread_id: str) -> WeatherReply:
    """Run the agent and report both the reading and how long each step took.

    Every number in the trace is measured. What the model spends thinking is
    whatever is left once the tool calls are subtracted, which is why it is
    derived rather than timed directly -- there is no point in the loop where
    only the model is running that we can wrap.
    """
    _tool_timings.set([])
    started = time.perf_counter()

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
    total_ms = (time.perf_counter() - started) * 1000
    tools = _tool_timings.get([])
    model_ms = total_ms - sum(segment.ms for segment in tools)

    reading: WeatherResponse = response['structured_response']
    return WeatherReply(
        **reading.model_dump(),
        # Tool calls in the order the model made them, then whatever time is not
        # accounted for by them.
        trace=[*tools, TraceSegment(label='model', ms=max(model_ms, 0.0))],
    )
