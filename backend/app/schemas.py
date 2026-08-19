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


class TraceSegment(BaseModel):
    """One measured stretch of work done while producing a reply."""

    label: str
    ms: float


class WeatherReply(WeatherResponse):
    """What the endpoint returns: the reading, plus a measured account of how it
    was produced.

    Deliberately separate from WeatherResponse. That model is the agent's
    response_format, so every field on it is a field the model has to fill in --
    timings belong to the server, not to the model, and putting them there would
    invite it to invent them.
    """

    trace: list[TraceSegment] = []


class Source(BaseModel):
    """A passage the retriever returned, and how close it was to the query.

    Surfaced so an answer can be checked against what was actually retrieved,
    rather than taken on trust -- the retrieval equivalent of the nullable
    weather readings.
    """

    text: str
    score: float
    query: str = Field(description='The search the model chose to run')


class RagReply(BaseModel):
    answer: str
    # Empty when the model answered without searching, which is itself worth
    # seeing: it means the answer came from the model, not the knowledge base.
    sources: list[Source] = []
    trace: list[TraceSegment] = []


class AskRequest(BaseModel):
    question: str = Field(min_length=1)


class AskResponse(BaseModel):
    answer: str
