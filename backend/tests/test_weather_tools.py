"""The agent's own tools, called directly.

The model's decision to call them is not tested -- that would mean a live model.
What is tested is everything the model relies on: the id lookup and the HTTP
call, including how the latter behaves when the upstream API fails.
"""

from typing import Any

import httpx
import pytest

from app.agents.weather import get_weather, locate_user

CONDITIONS = {'current_condition': [{'temp_C': '17', 'temp_F': '63', 'humidity': '84'}]}


@pytest.mark.parametrize(
    ('user_id', 'expected'),
    [
        ('ABC123', 'Vienna'),
        ('XYZ456', 'London'),
        ('HJKL111', 'Paris'),
    ],
)
def test_known_ids_resolve_to_their_city(runtime_for, user_id: str, expected: str) -> None:
    assert locate_user.func(runtime_for(user_id)) == expected


@pytest.mark.parametrize('user_id', ['NOPE999', '', 'abc123'])
def test_unrecognised_ids_resolve_to_unknown(runtime_for, user_id: str) -> None:
    """Including 'abc123': the match is exact, so case matters."""
    assert locate_user.func(runtime_for(user_id)) == 'Unknown'


async def test_get_weather_returns_the_upstream_payload(mock_wttr) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=CONDITIONS)

    mock_wttr(handler)

    assert await get_weather.ainvoke({'city': 'Vienna'}) == CONDITIONS


async def test_get_weather_asks_for_json(mock_wttr) -> None:
    """format=j1 is what makes wttr.in answer with JSON instead of ASCII art."""
    seen: list[httpx.URL] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url)
        return httpx.Response(200, json=CONDITIONS)

    mock_wttr(handler)
    await get_weather.ainvoke({'city': 'Vienna'})

    assert str(seen[0]) == 'https://wttr.in/Vienna?format=j1'


async def test_get_weather_raises_on_an_upstream_error(mock_wttr) -> None:
    """raise_for_status matters: without it the tool would hand the model an
    error page as though it were weather data."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text='service unavailable')

    mock_wttr(handler)

    with pytest.raises(httpx.HTTPStatusError):
        await get_weather.ainvoke({'city': 'Vienna'})


def test_the_model_cannot_choose_the_user_id() -> None:
    """The schema sent to the model exposes no arguments for locate_user -- the
    id comes from the request context, so the model has no way to look up
    someone else."""
    schema: dict[str, Any] = locate_user.tool_call_schema.model_json_schema()

    assert schema.get('properties', {}) == {}


def test_the_model_chooses_only_the_city() -> None:
    schema: dict[str, Any] = get_weather.tool_call_schema.model_json_schema()

    assert list(schema['properties']) == ['city']
    assert schema['required'] == ['city']


async def test_tool_timings_are_recorded_while_a_tool_runs(mock_wttr) -> None:
    """The trace the API returns has to be measured, not assembled from
    plausible-looking proportions -- the same standard the nullable readings
    hold the model to."""
    import asyncio

    from app.agents.weather import _tool_timings

    async def slow_handler(request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(0.05)
        return httpx.Response(200, json=CONDITIONS)

    mock_wttr(slow_handler)
    _tool_timings.set([])

    await get_weather.ainvoke({'city': 'Vienna'})

    recorded = _tool_timings.get()
    assert [segment.label for segment in recorded] == ['get_weather']
    # The handler sleeps 50ms, so anything much below that is not a measurement.
    assert recorded[0].ms >= 45


async def test_a_failed_tool_is_still_timed(mock_wttr) -> None:
    """Otherwise a slow failure would vanish from the trace and the model's
    share would silently absorb it."""
    from app.agents.weather import _tool_timings

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text='service unavailable')

    mock_wttr(handler)
    _tool_timings.set([])

    with pytest.raises(httpx.HTTPStatusError):
        await get_weather.ainvoke({'city': 'Vienna'})

    assert [segment.label for segment in _tool_timings.get()] == ['get_weather']
