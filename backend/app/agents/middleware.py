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

from app.agents.timing import Usage, record, record_usage


def _record_usage_from(response) -> None:
    """Pull token counts off whatever the model returned.

    Tokens are reported per message, and a turn can carry more than one, so this
    sums rather than taking the first. A message without usage metadata is
    skipped rather than counted as zero: absent and none are different, and only
    one of them should be reported as a cost.
    """
    for message in getattr(response, 'result', None) or []:
        usage = getattr(message, 'usage_metadata', None)
        if not usage:
            continue
        record_usage(
            Usage(
                model_name=(getattr(message, 'response_metadata', None) or {}).get(
                    'model_name', ''
                ),
                input_tokens=usage.get('input_tokens', 0),
                output_tokens=usage.get('output_tokens', 0),
                cached_input_tokens=(usage.get('input_token_details') or {}).get(
                    'cache_read', 0
                ),
            )
        )


class TracingMiddleware(AgentMiddleware):
    """Records how long each model call and each tool call takes."""

    async def awrap_model_call(self, request, handler):
        started = time.perf_counter()
        try:
            response = await handler(request)
        finally:
            # finally, not after the return: a model call that fails still
            # consumed the time, and dropping it would inflate whatever segment
            # the remainder lands in.
            record('model', started)

        _record_usage_from(response)
        return response

    async def awrap_tool_call(self, request, handler):
        started = time.perf_counter()
        try:
            return await handler(request)
        finally:
            record(request.tool_call['name'], started)
