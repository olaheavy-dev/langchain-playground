from pydantic import BaseModel, Field


class WeatherRequest(BaseModel):
    user_id: str = Field(description='Identifies the user, used to look up their city')
    thread_id: str = Field(description='Identifies the conversation, used for agent memory')


class WeatherResponse(BaseModel):
    """Doubles as the agent's response_format, so the API contract and the
    structured output the model must fill in are defined in one place."""

    summary: str
    # None when the location could not be determined, so callers never see a fabricated 0.0
    temperature_celsius: float | None = None
    temperature_fahrenheit: float | None = None
    humidity: float | None = None


class AskRequest(BaseModel):
    question: str = Field(min_length=1)


class AskResponse(BaseModel):
    answer: str
