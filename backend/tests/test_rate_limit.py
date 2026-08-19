"""The cap that stands between a public URL and an unpleasant OpenAI bill."""

import httpx
import pytest

from app.rate_limit import RateLimitMiddleware
from app.routers import weather as weather_router
from app.schemas import Trace, WeatherReply

REPLY = WeatherReply(summary='Fine.', trace=Trace(total_ms=1.0))


@pytest.fixture
def free_agent(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_agent(user_id: str, thread_id: str) -> WeatherReply:
        return REPLY

    monkeypatch.setattr(weather_router, 'ask_weather_agent', fake_agent)


@pytest.fixture
def tight_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    """Three requests a minute, so the test does not have to make twenty."""
    from app import main

    for middleware in main.app.user_middleware:
        if middleware.cls is RateLimitMiddleware:
            monkeypatch.setitem(middleware.kwargs, 'limit', 3)
    main.app.middleware_stack = main.app.build_middleware_stack()


async def test_requests_are_allowed_up_to_the_limit(
    client: httpx.AsyncClient, free_agent: None, tight_limit: None
) -> None:
    for _ in range(3):
        response = await client.post(
            '/api/weather', json={'user_id': 'ABC123', 'thread_id': 't1'}
        )
        assert response.status_code == 200


async def test_going_over_the_limit_is_refused_with_retry_after(
    client: httpx.AsyncClient, free_agent: None, tight_limit: None
) -> None:
    for _ in range(3):
        await client.post('/api/weather', json={'user_id': 'ABC123', 'thread_id': 't1'})

    response = await client.post(
        '/api/weather', json={'user_id': 'ABC123', 'thread_id': 't1'}
    )

    assert response.status_code == 429
    # Without this a client has no way to know when to come back, and polls.
    assert int(response.headers['retry-after']) > 0
    assert 'Rate limit reached' in response.json()['detail']


async def test_health_is_never_metered(
    client: httpx.AsyncClient, tight_limit: None
) -> None:
    """A platform's health check runs constantly and costs nothing; counting it
    would lock out real callers."""
    for _ in range(10):
        assert (await client.get('/health')).status_code == 200


async def test_clients_are_counted_separately(
    client: httpx.AsyncClient, free_agent: None, tight_limit: None
) -> None:
    """One heavy user must not lock everyone else out."""
    heavy = {'X-Forwarded-For': '10.0.0.1'}
    other = {'X-Forwarded-For': '10.0.0.2'}
    body = {'user_id': 'ABC123', 'thread_id': 't1'}

    for _ in range(3):
        await client.post('/api/weather', json=body, headers=heavy)

    assert (await client.post('/api/weather', json=body, headers=heavy)).status_code == 429
    assert (await client.post('/api/weather', json=body, headers=other)).status_code == 200
