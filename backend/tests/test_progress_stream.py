"""Streaming an agent run.

The interesting cases are not the happy path but what happens when the client
leaves, because an agent stopped halfway through a tool call leaves state that
poisons its thread for good.
"""

import asyncio
import json

import pytest
from pydantic import BaseModel

from app.agents.progress import Step, emit, listen, stop
from app.routers.progress_stream import stream_run


class Reply(BaseModel):
    answer: str


def parse(chunk: str) -> dict:
    return json.loads(chunk.removeprefix('data: ').strip())


async def test_steps_arrive_before_the_answer() -> None:
    """The whole point: an agent that takes several seconds should say what it
    is doing rather than showing nothing until it is done."""

    async def run() -> Reply:
        emit(Step(label='locate_user', ms=1.0, start_ms=10.0))
        await asyncio.sleep(0.01)
        emit(Step(label='get_weather', ms=180.0, start_ms=12.0))
        await asyncio.sleep(0.01)
        return Reply(answer='Sunny.')

    events = [parse(chunk) async for chunk in stream_run(run)]

    assert [event['type'] for event in events] == ['step', 'step', 'result']
    assert [event['label'] for event in events if event['type'] == 'step'] == [
        'locate_user',
        'get_weather',
    ]
    assert events[-1]['reply']['answer'] == 'Sunny.'


async def test_a_step_that_lands_with_the_answer_is_not_dropped() -> None:
    """The last step always finishes a moment before the reply, and losing it
    would leave the trace a step short of the truth."""

    async def run() -> Reply:
        emit(Step(label='model', ms=900.0, start_ms=0.0))
        return Reply(answer='Done.')

    events = [parse(chunk) async for chunk in stream_run(run)]

    assert [event['type'] for event in events] == ['step', 'result']


async def test_a_failure_travels_as_an_event() -> None:
    """Once the response has started the status code is already sent, so an
    exception cannot become a 500."""

    async def run() -> Reply:
        raise RuntimeError('model unavailable')

    events = [parse(chunk) async for chunk in stream_run(run)]

    assert events[-1]['type'] == 'error'
    assert 'model unavailable' in events[-1]['detail']


async def test_the_agent_is_left_running_when_the_client_leaves() -> None:
    """Cancelling an agent between a tool call being requested and its result
    being recorded leaves an unanswered tool call in the checkpoint, which is
    replayed on every later request -- so one closed tab would break that thread
    permanently. Letting it finish costs one unread answer instead."""
    finished = asyncio.Event()

    async def run() -> Reply:
        emit(Step(label='model', ms=5.0, start_ms=0.0))
        await asyncio.sleep(0.05)
        finished.set()
        return Reply(answer='Nobody will read this.')

    stream = stream_run(run)
    await anext(stream)  # the first step, then walk away
    await stream.aclose()

    await asyncio.wait_for(finished.wait(), timeout=1.0)
    assert finished.is_set()


async def test_progress_is_optional() -> None:
    """The non-streaming endpoints share this agent code and nothing is
    listening there, so emit has to be a no-op rather than an error."""
    stop()

    emit(Step(label='model', ms=1.0, start_ms=0.0))  # must not raise


async def test_listening_starts_a_fresh_channel() -> None:
    queue = listen()
    emit(Step(label='model', ms=1.0, start_ms=0.0))

    assert queue.qsize() == 1
    stop()
