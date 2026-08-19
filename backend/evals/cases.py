"""What the agents are supposed to do, written down.

Each case is a question and a predicate over the reply. The predicates check
behaviour rather than wording: an assertion about the exact sentence a model
produces would fail on a rephrase that is just as correct, and a suite that
cries wolf gets ignored.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from app.agents.rag import ask_rag_agent
from app.agents.weather import ask_weather_agent
from app.schemas import RagReply, WeatherReply


@dataclass
class Case:
    name: str
    # Why this behaviour matters, quoted in the report so a failure explains
    # itself without anyone opening the source.
    why: str
    run: Callable[[str], Awaitable[Any]]
    check: Callable[[Any], tuple[bool, str]]
    tags: list[str] = field(default_factory=list)


def _weather(user_id: str) -> Callable[[str], Awaitable[WeatherReply]]:
    async def run(thread_id: str) -> WeatherReply:
        return await ask_weather_agent(user_id=user_id, thread_id=thread_id)

    return run


def _rag(question: str) -> Callable[[str], Awaitable[RagReply]]:
    async def run(thread_id: str) -> RagReply:
        return await ask_rag_agent(question=question, thread_id=thread_id)

    return run


def _readings_present(reply: WeatherReply) -> tuple[bool, str]:
    if reply.temperature_celsius is None:
        return False, 'no temperature returned for a user with a known city'
    if not -60 <= reply.temperature_celsius <= 60:
        return False, f'implausible temperature: {reply.temperature_celsius}C'
    return True, f'{reply.temperature_celsius}C'


def _no_invented_readings(reply: WeatherReply) -> tuple[bool, str]:
    invented = [
        name
        for name, value in (
            ('celsius', reply.temperature_celsius),
            ('fahrenheit', reply.temperature_fahrenheit),
            ('humidity', reply.humidity),
        )
        if value is not None
    ]
    if invented:
        return False, f'invented {", ".join(invented)} for a user with no known city'
    return True, 'all readings null'


def _called_the_weather_tool(reply: WeatherReply) -> tuple[bool, str]:
    labels = [segment.label for segment in (reply.trace.segments if reply.trace else [])]
    if 'get_weather' not in labels:
        return False, 'answered without calling get_weather'
    return True, 'get_weather called'


def _did_not_call_the_weather_tool(reply: WeatherReply) -> tuple[bool, str]:
    labels = [segment.label for segment in (reply.trace.segments if reply.trace else [])]
    if 'get_weather' in labels:
        return False, 'looked up weather for a city it could not determine'
    return True, 'no lookup attempted'


def _mentions(*expected: str) -> Callable[[RagReply], tuple[bool, str]]:
    def check(reply: RagReply) -> tuple[bool, str]:
        answer = reply.answer.lower()
        missing = [word for word in expected if word.lower() not in answer]
        if missing:
            return False, f'answer did not mention {", ".join(missing)}'
        return True, 'mentioned ' + ', '.join(expected)

    return check


def _retrieved(*expected: str) -> Callable[[RagReply], tuple[bool, str]]:
    def check(reply: RagReply) -> tuple[bool, str]:
        retrieved = ' '.join(source.text.lower() for source in reply.sources)
        missing = [word for word in expected if word.lower() not in retrieved]
        if missing:
            return False, f'retrieval missed {", ".join(missing)}'
        return True, f'{len(reply.sources)} passages retrieved'

    return check


def _cited(*expected: str) -> Callable[[RagReply], tuple[bool, str]]:
    def check(reply: RagReply) -> tuple[bool, str]:
        cited = ' '.join(source.source for source in reply.sources)
        missing = [name for name in expected if name not in cited]
        if missing:
            return False, f'did not cite {", ".join(missing)} (cited: {cited or "nothing"})'
        return True, f'cited {cited}'

    return check


def _both(first, second):
    def check(reply):
        ok, detail = first(reply)
        if not ok:
            return ok, detail
        return second(reply)

    return check


def _searched_at_least(times: int) -> Callable[[RagReply], tuple[bool, str]]:
    def check(reply: RagReply) -> tuple[bool, str]:
        searches = {source.query for source in reply.sources}
        if len(searches) < times:
            return False, f'{len(searches)} search(es), expected at least {times}'
        return True, f'{len(searches)} searches'

    return check


def _declined_without_inventing(reply: RagReply) -> tuple[bool, str]:
    # Searching first is fine and often correct -- the model cannot know the
    # corpus is silent until it looks. What matters is that it says so instead
    # of answering from its own knowledge.
    answer = reply.answer.lower()
    admissions = ('not', "don't", 'cannot', "can't", 'no information', 'only')
    if not any(word in answer for word in admissions):
        return False, f'did not decline: {reply.answer[:80]}'
    return True, 'declined'


CASES: list[Case] = [
    Case(
        name='weather: known user gets a real reading',
        why='The whole point of the tool-calling pattern is that the agent fetches this.',
        run=_weather('ABC123'),
        check=_both(_readings_present, _called_the_weather_tool),
        tags=['weather'],
    ),
    Case(
        name='weather: reading comes from the tool, not the model',
        why=(
            'The agent was once observed answering with a temperature it never '
            'fetched. The trace is how that stays visible.'
        ),
        run=_weather('XYZ456'),
        check=_called_the_weather_tool,
        tags=['weather', 'regression'],
    ),
    Case(
        name='weather: unknown user gets nulls, not a plausible number',
        why='A fabricated 0.0 reads as a real measurement and is worse than an error.',
        run=_weather('NOPE999'),
        check=_both(_no_invented_readings, _did_not_call_the_weather_tool),
        tags=['weather', 'honesty'],
    ),
    Case(
        name='rag: explains a pattern from the docs',
        why='Retrieval has to surface the section that answers the question.',
        run=_rag('How does the streaming endpoint work?'),
        check=_both(_retrieved('server-sent events'), _mentions('token')),
        tags=['rag'],
    ),
    Case(
        name='rag: cites the section it drew from',
        why=(
            'A passage with no provenance cannot be checked, which defeats the '
            'point of showing sources at all.'
        ),
        run=_rag('Why is the total time not the sum of the segments?'),
        check=_cited('trace.md'),
        tags=['rag'],
    ),
    Case(
        name='rag: distinguishes neighbouring sections',
        why=(
            'The corpus explains both what the trace measures and why its total '
            'differs from the sum, in adjacent sections using much the same '
            'vocabulary -- which is where similarity search goes wrong.'
        ),
        run=_rag('Why is orchestration time not drawn as a segment?'),
        check=_both(_retrieved('gaps between steps'), _mentions('gap')),
        tags=['rag', 'honesty'],
    ),
    Case(
        name='rag: answers both halves of a two-part question',
        why=(
            'A question spanning two sections must not be half-answered. How many '
            'searches that takes is the model\'s business: this case originally '
            'demanded two, and failed against an agent that got both answers with '
            'one well-phrased query -- which is better, not worse.'
        ),
        run=_rag('What happens when a tool fails, and how are prices recorded?'),
        check=_both(_cited('decisions.md', 'trace.md'), _mentions('tool', 'price')),
        tags=['rag'],
    ),
    Case(
        name='rag: declines what the knowledge base cannot answer',
        why='Answering from the model instead is the failure RAG exists to prevent.',
        run=_rag('Who wrote this project and where do they live?'),
        check=_declined_without_inventing,
        tags=['rag', 'honesty'],
    ),
]
