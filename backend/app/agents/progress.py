"""Reporting what an agent is doing while it is still doing it.

The tool-calling and retrieval agents take several seconds and show nothing
until they finish, which is the worst of both patterns: the wait of an agent
with none of the reassurance of a stream. The steps are already being measured
for the trace, so the same measurements can be sent as they happen.

Progress is optional. When nothing is listening, emit() is a no-op and the agent
behaves exactly as it did before -- the non-streaming endpoints are unchanged.
"""

import asyncio
from contextvars import ContextVar
from dataclasses import dataclass

# Where progress for the current request goes, when anyone is listening.
_channel: ContextVar[asyncio.Queue | None] = ContextVar('progress_channel', default=None)


@dataclass
class Step:
    """A step that has just finished."""

    label: str
    ms: float
    start_ms: float


def listen() -> asyncio.Queue:
    """Start collecting progress for this request and return the queue it lands
    in."""
    queue: asyncio.Queue = asyncio.Queue()
    _channel.set(queue)
    return queue


def emit(step: Step) -> None:
    """Report a finished step, if anyone is listening.

    put_nowait rather than await: this is called from middleware wrapped around
    the agent's own work, and a slow consumer must not be able to stall the
    agent it is watching. The queue is unbounded, and a request's worth of steps
    is a handful.
    """
    queue = _channel.get()
    if queue is not None:
        queue.put_nowait(step)


def stop() -> None:
    """Close the channel for this request."""
    _channel.set(None)
