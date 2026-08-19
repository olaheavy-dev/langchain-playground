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
    """One measured stretch of work done while producing a reply.

    Carries when it started as well as how long it took, because the agent runs
    tool calls concurrently: two searches issued in the same turn overlap in
    real time, and laying them end to end would both invent an order and
    overstate how long retrieval took.
    """

    label: str
    ms: float
    start_ms: float = 0.0


class Trace(BaseModel):
    """A measured account of how a reply was produced.

    total_ms is the wall time, which is not the sum of the segments: work can
    overlap, and the gaps between steps are the agent's own orchestration. The
    interface draws the segments against the total, so both are visible without
    inventing a position for time nobody measured.
    """

    total_ms: float
    segments: list[TraceSegment] = []

    input_tokens: int = 0
    output_tokens: int = 0
    # Input the provider served from its own cache, billed at a discount. Part
    # of input_tokens rather than additional to it.
    cached_input_tokens: int = 0
    model_calls: int = 0
    # None when no price is on file for the model, which is not the same as
    # free. Covers model calls only: embedding a search query costs a fraction
    # of a cent and is not reported here rather than being guessed at.
    cost_usd: float | None = None


class WeatherReply(WeatherResponse):
    """What the endpoint returns: the reading, plus a measured account of how it
    was produced.

    Deliberately separate from WeatherResponse. That model is the agent's
    response_format, so every field on it is a field the model has to fill in --
    timings belong to the server, not to the model, and putting them there would
    invite it to invent them.
    """

    trace: Trace | None = None


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
    trace: Trace | None = None


class AskRequest(BaseModel):
    question: str = Field(min_length=1)


class AskResponse(BaseModel):
    answer: str
