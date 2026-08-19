"""The retrieval tool itself, with a stub vector store.

The embedding call is stubbed rather than mocked at the network layer: what is
worth asserting is that the tool records what it retrieved and how long it took,
not that OpenAI returns vectors.
"""

from dataclasses import dataclass
from typing import Any

import pytest

from app.agents import rag
from app.agents.timing import _timings


@dataclass
class FakeDocument:
    page_content: str


class FakeStore:
    def __init__(self, hits: list[tuple[str, float]]) -> None:
        self.hits = hits
        self.queries: list[str] = []

    def similarity_search_with_score(self, query: str, k: int) -> list[tuple[Any, float]]:
        self.queries.append(query)
        return [(FakeDocument(text), score) for text, score in self.hits[:k]]


@pytest.fixture
def store(monkeypatch: pytest.MonkeyPatch):
    def install(hits: list[tuple[str, float]]) -> FakeStore:
        fake = FakeStore(hits)
        monkeypatch.setattr(rag, '_get_store', lambda: fake)
        return fake

    return install


def test_the_model_sees_only_the_passages(store) -> None:
    """The scores are for the interface, not for the model -- it gets prose."""
    store([('I love apples.', 0.81), ('I enjoy oranges.', 0.77)])
    rag._sources.set([])
    _timings.set([])

    returned = rag.kb_search.func('fruit the person likes')

    assert returned == 'I love apples.\nI enjoy oranges.'


def test_what_was_retrieved_is_recorded_for_display(store) -> None:
    store([('I love apples.', 0.81), ('I enjoy oranges.', 0.77)])
    rag._sources.set([])
    _timings.set([])

    rag.kb_search.func('fruit the person likes')

    collected = rag._sources.get()
    assert [(source.text, source.score) for source in collected] == [
        ('I love apples.', 0.81),
        ('I enjoy oranges.', 0.77),
    ]
    # The query is kept too, so a second search is distinguishable from the first.
    assert {source.query for source in collected} == {'fruit the person likes'}


def test_two_searches_accumulate(store) -> None:
    """Agentic retrieval means the model may search again after reading the
    first result; the interface should show both."""
    store([('I love apples.', 0.81)])
    rag._sources.set([])
    _timings.set([])

    rag.kb_search.func('fruit they like')
    rag.kb_search.func('computers they like')

    assert [source.query for source in rag._sources.get()] == [
        'fruit they like',
        'computers they like',
    ]


def test_retrieval_is_capped(store) -> None:
    """Otherwise a small knowledge base returns itself in full and the retrieval
    demonstrates nothing."""
    fake = store([(f'passage {index}.', 0.5) for index in range(10)])
    rag._sources.set([])
    _timings.set([])

    rag.kb_search.func('anything')

    assert len(rag._sources.get()) == rag.RETRIEVE_COUNT
    assert fake.queries == ['anything']


def test_the_model_chooses_only_the_query() -> None:
    schema: dict[str, Any] = rag.kb_search.tool_call_schema.model_json_schema()

    assert list(schema['properties']) == ['query']


def test_a_failing_search_answers_the_model_instead_of_raising(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A raising tool never produces a tool message, which leaves an unanswered
    tool call in the checkpoint -- and that state is replayed on every later
    request, so the thread stays broken permanently. Found the hard way."""

    class BrokenStore:
        def similarity_search_with_score(self, query: str, k: int):
            raise RuntimeError('index unavailable')

    monkeypatch.setattr(rag, '_get_store', lambda: BrokenStore())
    rag._sources.set([])
    _timings.set([])

    returned = rag.kb_search.func('anything')

    assert 'could not be searched' in returned
    assert 'index unavailable' in returned


def test_a_failing_search_is_logged(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """Answering the model instead of raising means the request still returns
    200 and the access log looks healthy, so the failure has to be shouted
    somewhere or a broken knowledge base is invisible from the server side."""

    class BrokenStore:
        def similarity_search_with_score(self, query: str, k: int):
            raise RuntimeError('index unavailable')

    monkeypatch.setattr(rag, '_get_store', lambda: BrokenStore())
    rag._sources.set([])
    _timings.set([])

    with caplog.at_level('ERROR'):
        rag.kb_search.func('fruit')

    assert 'kb_search failed' in caplog.text
    assert 'fruit' in caplog.text
