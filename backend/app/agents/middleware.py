"""Timing as middleware, rather than as something every tool remembers to do.

The agent loop exposes hooks around each model call and each tool call, which is
exactly where a stopwatch belongs. Two consequences worth having:

  * The model's share is now measured rather than derived. It used to be "the
    total, minus the tools", because nothing in the loop marked where a model
    call began and ended -- so any time the agent spent orchestrating was
    silently attributed to the model.
  * A tool no longer knows it is being timed. Timing lives in one class instead
    of a try/finally in every tool, and a tool added later is measured without
    anyone remembering to instrument it.
"""

import time

from langchain.agents.middleware import AgentMiddleware

from app.agents.timing import record


class TracingMiddleware(AgentMiddleware):
    """Records how long each model call and each tool call takes."""

    async def awrap_model_call(self, request, handler):
        started = time.perf_counter()
        try:
            return await handler(request)
        finally:
            # finally, not after the return: a model call that fails still
            # consumed the time, and dropping it would inflate whatever segment
            # the remainder lands in.
            record('model', started)

    async def awrap_tool_call(self, request, handler):
        started = time.perf_counter()
        try:
            return await handler(request)
        finally:
            record(request.tool_call['name'], started)
