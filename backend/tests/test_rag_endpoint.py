"""The RAG route, with the agent replaced.

What matters here is that the sources travel with the answer, and that an empty
sources list survives -- it is how a caller learns the model answered without
consulting the knowledge base at all.
"""

import httpx
import pytest

from app.routers import rag as rag_router
from app.schemas import RagReply, Source, TraceSegment

ANSWERED = RagReply(
    answer='They like apples, oranges and pears.',
    sources=[
        Source(text='I love apples.', score=0.82, query='fruits the person likes'),
        Source(text='I enjoy oranges.', score=0.79, query='fruits the person likes'),
    ],
    trace=[TraceSegment(label='kb_search', ms=210.0), TraceSegment(label='model', ms=1400.0)],
)


async def test_returns_the_answer_with_what_it_was_drawn_from(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_agent(question: str, thread_id: str) -> RagReply:
        return ANSWERED

    monkeypatch.setattr(rag_router, 'ask_rag_agent', fake_agent)

    response = await client.post(
        '/api/rag', json={'question': 'What fruits do they like?', 'thread_id': 't1'}
    )
    body = response.json()

    assert response.status_code == 200
    assert body['answer'] == 'They like apples, oranges and pears.'
    assert [source['text'] for source in body['sources']] == [
        'I love apples.',
        'I enjoy oranges.',
    ]
    assert body['sources'][0]['query'] == 'fruits the person likes'
    assert [segment['label'] for segment in body['trace']] == ['kb_search', 'model']


async def test_an_unsearched_answer_reports_no_sources(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Not an error: the model is allowed to decide a question needs no search.
    The empty list is what tells the caller the answer did not come from the
    knowledge base."""

    async def fake_agent(question: str, thread_id: str) -> RagReply:
        return RagReply(answer='I have no idea.', trace=[TraceSegment(label='model', ms=900.0)])

    monkeypatch.setattr(rag_router, 'ask_rag_agent', fake_agent)

    response = await client.post(
        '/api/rag', json={'question': 'Who won in 1998?', 'thread_id': 't1'}
    )

    assert response.status_code == 200
    assert response.json()['sources'] == []


async def test_passes_question_and_thread_through(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: list[tuple[str, str]] = []

    async def fake_agent(question: str, thread_id: str) -> RagReply:
        seen.append((question, thread_id))
        return ANSWERED

    monkeypatch.setattr(rag_router, 'ask_rag_agent', fake_agent)

    await client.post('/api/rag', json={'question': 'Bananas?', 'thread_id': 'first'})

    assert seen == [('Bananas?', 'first')]


async def test_an_empty_question_is_rejected(client: httpx.AsyncClient) -> None:
    response = await client.post('/api/rag', json={'question': '', 'thread_id': 't1'})

    assert response.status_code == 422


async def test_thread_id_is_required(client: httpx.AsyncClient) -> None:
    response = await client.post('/api/rag', json={'question': 'Bananas?'})

    assert response.status_code == 422
