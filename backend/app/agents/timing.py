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
from dataclasses import dataclass

from app.pricing import cost_usd
from app.schemas import Trace, TraceSegment

@dataclass
class Usage:
    """What one model call consumed."""

    model_name: str
    input_tokens: int
    output_tokens: int
    cached_input_tokens: int


# Timings for the request currently being served. ContextVars rather than module
# globals because concurrent requests share this module and each needs its own:
# asyncio tasks inherit a copy of the context, so a task started for a tool call
# still appends to the list its request created.
_timings: ContextVar[list[TraceSegment]] = ContextVar('timings')
_trace_start: ContextVar[float] = ContextVar('trace_start')
_usage: ContextVar[list[Usage]] = ContextVar('usage')


def start_collecting() -> float:
    """Begin a fresh trace and return the moment it started."""
    started = time.perf_counter()
    _timings.set([])
    _trace_start.set(started)
    _usage.set([])
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


def since_start(moment: float) -> float:
    """Milliseconds from the start of this request's trace to the given moment."""
    return (moment - _trace_start.get(moment)) * 1000


def record_usage(usage: Usage) -> None:
    """Note what a model call consumed, if anyone is collecting."""
    collected = _usage.get(None)
    if collected is not None:
        collected.append(usage)


def finish(started: float) -> Trace:
    """Close the trace: every measured step, and the wall time they sit inside.

    Every segment is measured, the model's included -- TracingMiddleware wraps
    each model call, so nothing is inferred by subtraction.

    The leftover is deliberately not a segment. Orchestration happens in the
    gaps between steps rather than in one block, so drawing it as a bar would
    put it somewhere it never was; reporting the total instead lets the gaps
    speak for themselves.
    """
    calls = _usage.get([])
    input_tokens = sum(call.input_tokens for call in calls)
    output_tokens = sum(call.output_tokens for call in calls)
    cached = sum(call.cached_input_tokens for call in calls)

    # An agent turn can in principle mix models, so cost is summed per call
    # rather than priced once against a single name. A call whose model has no
    # price on file makes the whole total unknown, because a partial sum
    # presented as the cost would understate it.
    per_call = [
        cost_usd(call.model_name, call.input_tokens, call.output_tokens, call.cached_input_tokens)
        for call in calls
    ]
    # No calls means nothing was measured, which is not the same as nothing
    # being spent -- reporting $0.00 there would be the same lie as pricing an
    # unpriced model at zero.
    if not per_call or any(cost is None for cost in per_call):
        total_cost = None
    else:
        total_cost = sum(per_call)

    return Trace(
        total_ms=(time.perf_counter() - started) * 1000,
        segments=_timings.get([]),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cached_input_tokens=cached,
        model_calls=len(calls),
        cost_usd=total_cost,
    )
