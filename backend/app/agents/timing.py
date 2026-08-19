"""Measuring how long each step of a reply takes.

The interface draws a trace under every answer, and every segment in it has to
be measured rather than estimated -- the same standard the nullable weather
readings hold the model to.
"""

import time
from contextvars import ContextVar

from app.schemas import TraceSegment

# Timings for the request currently being served. A ContextVar rather than a
# module global because concurrent requests share this module and each needs its
# own list: asyncio tasks inherit a copy of the context, so a task started for a
# tool call still appends to the list its request created.
_timings: ContextVar[list[TraceSegment]] = ContextVar('timings')


def start_collecting() -> float:
    """Begin a fresh trace and return the moment it started."""
    _timings.set([])
    return time.perf_counter()


def record(label: str, started: float) -> None:
    """Note how long a step took, if anyone is collecting.

    Callers put this in a finally block: a slow failure is a real part of the
    elapsed time, and dropping it would silently inflate the model's share.
    """
    collected = _timings.get(None)
    if collected is not None:
        collected.append(TraceSegment(label=label, ms=(time.perf_counter() - started) * 1000))


def finish(started: float) -> list[TraceSegment]:
    """Close the trace: the steps that were measured, then whatever time they do
    not account for.

    The model's share is derived rather than timed because there is no point in
    the agent loop where only the model is running that we can wrap.
    """
    total_ms = (time.perf_counter() - started) * 1000
    steps = _timings.get([])
    model_ms = total_ms - sum(segment.ms for segment in steps)
    return [*steps, TraceSegment(label='model', ms=max(model_ms, 0.0))]
