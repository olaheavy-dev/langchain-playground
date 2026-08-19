from app.schemas import AskRequest, WeatherResponse
import pytest
from pydantic import ValidationError


def test_readings_default_to_none() -> None:
    """A model that omits the readings must not produce zeros: None is how the
    schema expresses 'not known', and the frontend renders it as such."""
    response = WeatherResponse(summary='Could not place you.')

    assert response.temperature_celsius is None
    assert response.temperature_fahrenheit is None
    assert response.humidity is None


def test_summary_is_required() -> None:
    with pytest.raises(ValidationError):
        WeatherResponse()  # pyright: ignore[reportCallIssue]


def test_question_cannot_be_empty() -> None:
    """Guards the pointless round trip of asking the model nothing."""
    with pytest.raises(ValidationError):
        AskRequest(question='')
