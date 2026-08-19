"""A per-client cap on requests that cost money.

Every endpoint here calls a paid API without asking who is asking, so a deployed
instance is one loop away from an unpleasant bill. This is the smallest thing
that prevents that.

It is deliberately in-process: no Redis, no dependency, and therefore no shared
state between workers. With N workers a client gets N times the allowance, which
is fine for a demo and not fine for anything real -- the docstring says so
rather than leaving the next reader to discover it.
"""

import time
from collections import defaultdict, deque

from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

# Paths that cost money. /health and the docs are free and stay unmetered so a
# platform's health check never counts against a caller.
METERED_PREFIX = '/api/'


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Allow `limit` requests per client in any `window_seconds` stretch."""

    def __init__(self, app, limit: int = 20, window_seconds: float = 60.0) -> None:
        super().__init__(app)
        self.limit = limit
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def _client(self, request: Request) -> str:
        # Behind a proxy the socket address is the proxy's, so prefer the
        # forwarded chain's first entry -- which is client-supplied and
        # therefore spoofable. That is acceptable here: this limits accidents
        # and casual abuse, not a determined attacker.
        forwarded = request.headers.get('x-forwarded-for')
        if forwarded:
            return forwarded.split(',')[0].strip()
        return request.client.host if request.client else 'unknown'

    async def dispatch(self, request: Request, call_next):
        if not request.url.path.startswith(METERED_PREFIX):
            return await call_next(request)

        now = time.monotonic()
        hits = self._hits[self._client(request)]
        while hits and now - hits[0] > self.window_seconds:
            hits.popleft()

        if len(hits) >= self.limit:
            retry_after = int(self.window_seconds - (now - hits[0])) + 1
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    'detail': (
                        f'Rate limit reached: {self.limit} requests per '
                        f'{int(self.window_seconds)} seconds. Try again shortly.'
                    )
                },
                headers={'Retry-After': str(retry_after)},
            )

        hits.append(now)
        return await call_next(request)
