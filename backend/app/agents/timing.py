"""Measuring how long each step of a reply takes.

The interface draws a trace under every answer, and every segment in it has to
be measured rather than estimated -- the same standard the nullable weather
readings hold the model to.

Steps are recorded with a start offset as well as a duration. The agent issues
tool calls concurrently when the model asks for several at once, so segments can
genuinely overlap; a list of durations alone cannot express that.
"""

import time
from contextvars import ContextVar

from app.schemas import Trace, TraceSegment

# Timings for the request currently being served. ContextVars rather than module
# globals because concurrent requests share this module and each needs its own:
# asyncio tasks inherit a copy of the context, so a task started for a tool call
# still appends to the list its request created.
_timings: ContextVar[list[TraceSegment]] = ContextVar('timings')
_trace_start: ContextVar[float] = ContextVar('trace_start')


def start_collecting() -> float:
    """Begin a fresh trace and return the moment it started."""
    started = time.perf_counter()
    _timings.set([])
    _trace_start.set(started)
    return started


def record(label: str, started: float) -> None:
    """Note a step that has just finished, if anyone is collecting.

    Callers put this in a finally block: a slow failure is a real part of the
    elapsed time, and dropping it would inflate whatever segment the remainder
    lands in.
    """
    collected = _timings.get(None)
    if collected is None:
        return

    now = time.perf_counter()
    origin = _trace_start.get(started)
    collected.append(
        TraceSegment(
            label=label,
            ms=(now - started) * 1000,
            start_ms=(started - origin) * 1000,
        )
    )


def finish(started: float) -> Trace:
    """Close the trace: every measured step, and the wall time they sit inside.

    Every segment is measured, the model's included -- TracingMiddleware wraps
    each model call, so nothing is inferred by subtraction.

    The leftover is deliberately not a segment. Orchestration happens in the
    gaps between steps rather than in one block, so drawing it as a bar would
    put it somewhere it never was; reporting the total instead lets the gaps
    speak for themselves.
    """
    return Trace(
        total_ms=(time.perf_counter() - started) * 1000,
        segments=_timings.get([]),
    )
