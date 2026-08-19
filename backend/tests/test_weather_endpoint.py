"""The route, with the agent replaced.

Calling the real agent would cost money, need a live key and a live weather
API, and give a different answer every run. What is worth testing here is the
wiring: that the request reaches the agent with the right arguments and that
the response is serialised faithfully -- nulls included.
"""

import httpx
import pytest

from app.routers import weather as weather_router
from app.schemas import WeatherResponse

LOCATED = WeatherResponse(
    summary='Vienna is a brisk 17 degrees.',
    temperature_celsius=17.0,
    temperature_fahrenheit=63.0,
    humidity=84.0,
)


@pytest.fixture
def captured_calls(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, str]]:
    calls: list[dict[str, str]] = []

    async def fake_agent(user_id: str, thread_id: str) -> WeatherResponse:
        calls.append({'user_id': user_id, 'thread_id': thread_id})
        return LOCATED

    monkeypatch.setattr(weather_router, 'ask_weather_agent', fake_agent)
    return calls


async def test_returns_the_agents_reading(
    client: httpx.AsyncClient, captured_calls: list[dict[str, str]]
) -> None:
    response = await client.post(
        '/api/weather', json={'user_id': 'ABC123', 'thread_id': 't1'}
    )

    assert response.status_code == 200
    assert response.json() == {
        'summary': 'Vienna is a brisk 17 degrees.',
        'temperature_celsius': 17.0,
        'temperature_fahrenheit': 63.0,
        'humidity': 84.0,
    }


async def test_passes_user_and_thread_through_separately(
    client: httpx.AsyncClient, captured_calls: list[dict[str, str]]
) -> None:
    """Identity and conversation are distinct, so one user can hold several
    independent threads."""
    await client.post('/api/weather', json={'user_id': 'ABC123', 'thread_id': 'first'})
    await client.post('/api/weather', json={'user_id': 'ABC123', 'thread_id': 'second'})

    assert captured_calls == [
        {'user_id': 'ABC123', 'thread_id': 'first'},
        {'user_id': 'ABC123', 'thread_id': 'second'},
    ]


async def test_unknown_user_yields_nulls_not_zeros(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The regression this schema exists to prevent: a reading of 0.0 would look
    like a real measurement of a freezing city."""

    async def fake_agent(user_id: str, thread_id: str) -> WeatherResponse:
        return WeatherResponse(summary='I could not work out where you are.')

    monkeypatch.setattr(weather_router, 'ask_weather_agent', fake_agent)

    response = await client.post(
        '/api/weather', json={'user_id': 'NOPE999', 'thread_id': 't1'}
    )
    body = response.json()

    assert response.status_code == 200
    assert body['temperature_celsius'] is None
    assert body['temperature_fahrenheit'] is None
    assert body['humidity'] is None


async def test_thread_id_is_required(client: httpx.AsyncClient) -> None:
    response = await client.post('/api/weather', json={'user_id': 'ABC123'})

    assert response.status_code == 422
