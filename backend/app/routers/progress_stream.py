"""Turning an agent run into a stream of what it is doing.

The agent is started as a task and the progress queue is drained while it runs,
so steps reach the browser as they finish rather than after the answer is ready.
The finished reply is the last event.
"""

import asyncio
import json
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

from pydantic import BaseModel

from app.agents.progress import Step, listen, stop

logger = logging.getLogger(__name__)

SSE_HEADERS = {
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',  # stop nginx buffering the stream in production
}


def _event(payload: dict[str, Any]) -> str:
    # JSON-encoded because a value may contain newlines, and a newline is what
    # separates one SSE message from the next.
    return f'data: {json.dumps(payload)}\n\n'


async def stream_run(run: Callable[[], Awaitable[BaseModel]]) -> AsyncIterator[str]:
    """Run an agent, reporting each step as it finishes and the reply at the end."""
    queue = listen()
    task = asyncio.create_task(run())

    try:
        while True:
            drain = asyncio.create_task(queue.get())
            done, _ = await asyncio.wait({drain, task}, return_when=asyncio.FIRST_COMPLETED)

            if drain in done:
                step: Step = drain.result()
                yield _event(
                    {
                        'type': 'step',
                        'label': step.label,
                        'ms': step.ms,
                        'start_ms': step.start_ms,
                    }
                )
                continue

            # The agent finished. Anything already queued is still worth
            # sending: the last step always lands a moment before the reply, and
            # dropping it would leave the trace a step short of the truth.
            drain.cancel()
            while not queue.empty():
                step = queue.get_nowait()
                yield _event(
                    {
                        'type': 'step',
                        'label': step.label,
                        'ms': step.ms,
                        'start_ms': step.start_ms,
                    }
                )

            reply = task.result()
            yield _event({'type': 'result', 'reply': reply.model_dump(mode='json')})
            return
    except asyncio.CancelledError:
        # The client went away mid-run. The agent is deliberately NOT cancelled:
        # stopping it between a tool call being requested and its result being
        # recorded leaves an unanswered tool call in the checkpoint, and that
        # state is replayed on every later request -- so one closed tab would
        # break that thread permanently. The same failure mode kb_search avoids
        # by answering instead of raising.
        #
        # Letting it finish costs one answer nobody reads. That is cheaper than
        # a conversation that can never be used again.
        logger.info('client disconnected; letting the agent finish to keep its thread usable')
        raise
    except Exception as error:  # noqa: BLE001 -- the stream is the only channel
        # A raised exception cannot become a 500 once the response has started,
        # so failures travel as an event instead. The agent is left to finish
        # for the same reason as above.
        logger.exception('progress stream failed')
        yield _event({'type': 'error', 'detail': str(error)})
    finally:
        stop()
