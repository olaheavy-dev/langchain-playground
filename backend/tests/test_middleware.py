"""Timing middleware, tested by driving its hooks directly.

The point of moving timing here was that a tool should not have to remember to
measure itself, so these tests stand in for the per-tool timing tests they
replaced.
"""

import asyncio
from typing import Any

import pytest

from app.agents.middleware import TracingMiddleware
from app.agents.timing import _timings, finish, start_collecting


class FakeRequest:
    def __init__(self, name: str = 'kb_search') -> None:
        self.tool_call: dict[str, Any] = {'name': name, 'args': {}, 'id': 'call-1'}


async def test_a_model_call_is_timed() -> None:
    """The reason this exists: the model's share used to be the total minus the
    tools, so any time the agent spent orchestrating was charged to the model."""
    _timings.set([])

    async def handler(request):
        await asyncio.sleep(0.05)
        return 'response'

    result = await TracingMiddleware().awrap_model_call(object(), handler)

    assert result == 'response'
    recorded = _timings.get()
    assert [segment.label for segment in recorded] == ['model']
    assert recorded[0].ms >= 45


async def test_a_tool_call_is_timed_under_its_own_name() -> None:
    _timings.set([])

    async def handler(request):
        await asyncio.sleep(0.05)
        return 'tool message'

    await TracingMiddleware().awrap_tool_call(FakeRequest('get_weather'), handler)

    recorded = _timings.get()
    assert [segment.label for segment in recorded] == ['get_weather']
    assert recorded[0].ms >= 45


async def test_a_failing_model_call_is_still_timed() -> None:
    """A slow failure consumed the time either way, and dropping it would
    inflate whatever segment the remainder lands in."""
    _timings.set([])

    async def handler(request):
        await asyncio.sleep(0.02)
        raise RuntimeError('rate limited')

    with pytest.raises(RuntimeError):
        await TracingMiddleware().awrap_model_call(object(), handler)

    assert [segment.label for segment in _timings.get()] == ['model']


async def test_a_failing_tool_call_is_still_timed() -> None:
    _timings.set([])

    async def handler(request):
        raise RuntimeError('tool exploded')

    with pytest.raises(RuntimeError):
        await TracingMiddleware().awrap_tool_call(FakeRequest(), handler)

    assert [segment.label for segment in _timings.get()] == ['kb_search']


async def test_the_loop_reads_as_a_sequence() -> None:
    """One model call per turn, so an agent that used a tool shows model, tool,
    model -- the shape of the loop rather than a single lump."""
    started = start_collecting()
    middleware = TracingMiddleware()

    async def handler(request):
        return None

    await middleware.awrap_model_call(object(), handler)
    await middleware.awrap_tool_call(FakeRequest('locate_user'), handler)
    await middleware.awrap_model_call(object(), handler)

    assert [segment.label for segment in finish(started).segments][:3] == [
        'model',
        'locate_user',
        'model',
    ]


async def test_unaccounted_time_is_labelled_rather_than_hidden() -> None:
    """What is left after the measured steps is the agent's own orchestration.
    It used to be folded into the model's share, which made the model look
    slower than it was."""
    started = start_collecting()

    async def handler(request):
        return None

    await TracingMiddleware().awrap_model_call(object(), handler)
    await asyncio.sleep(0.03)

    trace = finish(started)

    # The overhead is the difference between the wall time and the work, and it
    # is reported as that difference rather than drawn as a block of time that
    # never happened in one place.
    assert [segment.label for segment in trace.segments] == ['model']
    assert trace.total_ms - sum(segment.ms for segment in trace.segments) >= 25


async def test_concurrent_work_is_counted_once() -> None:
    """Tool calls issued in the same turn run concurrently. Adding their
    durations together would both invent an order and overstate the work: two
    searches of 50ms that ran side by side took 50ms, not 100."""
    started = start_collecting()
    middleware = TracingMiddleware()

    async def handler(request):
        await asyncio.sleep(0.05)
        return None

    await asyncio.gather(
        middleware.awrap_tool_call(FakeRequest('kb_search'), handler),
        middleware.awrap_tool_call(FakeRequest('kb_search'), handler),
    )
    trace = finish(started)
    segments = trace.segments

    searches = [segment for segment in segments if segment.label == 'kb_search']
    assert len(searches) == 2
    # Both started at roughly the same moment, which is what makes them
    # drawable as overlapping rather than sequential.
    assert abs(searches[0].start_ms - searches[1].start_ms) < 20
    # And the wall time is the span of the work, not the sum of it: two 50ms
    # searches side by side took 50ms, and naive subtraction made the leftover
    # negative.
    assert trace.total_ms < sum(segment.ms for segment in segments)
