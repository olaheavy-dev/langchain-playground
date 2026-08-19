"""The agent's own tools, called directly.

The model's decision to call them is not tested -- that would mean a live model.
What is tested is everything the model relies on: the id lookup and the HTTP
call, including how the latter behaves when the upstream API fails.
"""

from typing import Any

import httpx
import pytest

from app.agents.weather import get_weather, locate_user

# Trimmed to the shape the tool reads. The real j1 response also carries three
# days of hourly forecast, which the tool deliberately drops.
CONDITIONS = {
    'current_condition': [
        {
            'temp_C': '17',
            'temp_F': '63',
            'humidity': '84',
            'FeelsLikeC': '16',
            'weatherDesc': [{'value': 'Light rain shower'}],
            'windspeedKmph': '11',
            'cloudcover': '75',
        }
    ],
    'weather': [{'hourly': ['...three days of forecast...']}],
}


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


async def test_get_weather_returns_only_the_current_conditions(mock_wttr) -> None:
    """The full j1 response is ~6,500 tokens of three-day forecast, all of which
    would go to the model as a tool message and then be carried in the thread
    for every later turn. The tool keeps today's numbers and drops the rest."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=CONDITIONS)

    mock_wttr(handler)

    reading = await get_weather.ainvoke({'city': 'Vienna'})

    assert reading == {
        'temp_C': '17',
        'temp_F': '63',
        'humidity': '84',
        'feels_like_C': '16',
        'description': 'Light rain shower',
        'wind_kmph': '11',
        'cloud_cover': '75',
    }
    assert 'weather' not in reading


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
