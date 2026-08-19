"""The two chat-model routes, with the model replaced."""

import json
from collections.abc import AsyncIterator

import httpx
import pytest

from app.routers import copilot as copilot_router


async def test_python_route_returns_the_whole_answer(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_ask(question: str) -> str:
        return f'You asked: {question}'

    monkeypatch.setattr(copilot_router, 'ask_python_copilot', fake_ask)

    response = await client.post(
        '/api/copilot/python', json={'question': 'When was Python released?'}
    )

    assert response.status_code == 200
    assert response.json() == {'answer': 'You asked: When was Python released?'}


async def test_python_route_rejects_an_empty_question(client: httpx.AsyncClient) -> None:
    response = await client.post('/api/copilot/python', json={'question': ''})

    assert response.status_code == 422


def stub_stream(*tokens: str):
    async def stream(question: str) -> AsyncIterator[str]:
        for token in tokens:
            yield token

    return stream


async def test_stream_sends_one_event_per_token(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        copilot_router, 'stream_programming_copilot', stub_stream('A', ' decorator')
    )

    response = await client.post(
        '/api/copilot/programming/stream', json={'question': 'What is a decorator?'}
    )

    assert response.status_code == 200
    assert response.headers['content-type'].startswith('text/event-stream')
    assert response.headers['cache-control'] == 'no-cache'
    assert response.text == (
        'data: {"token": "A"}\n\ndata: {"token": " decorator"}\n\ndata: [DONE]\n\n'
    )


async def test_a_token_containing_a_newline_stays_one_event(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The reason tokens are JSON-encoded. A raw newline inside a token would be
    read as the end of the message, splitting one token into two and corrupting
    everything after it."""
    monkeypatch.setattr(
        copilot_router, 'stream_programming_copilot', stub_stream('line one\n\nline two')
    )

    response = await client.post(
        '/api/copilot/programming/stream', json={'question': 'anything'}
    )

    events = [chunk for chunk in response.text.split('\n\n') if chunk]
    assert len(events) == 2  # the token, then [DONE]

    payload = json.loads(events[0].removeprefix('data: '))
    assert payload == {'token': 'line one\n\nline two'}


async def test_stream_terminates_with_done(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The client stops reading on this marker rather than on the connection
    closing, so a truncated stream is distinguishable from a finished one."""
    monkeypatch.setattr(copilot_router, 'stream_programming_copilot', stub_stream('x'))

    response = await client.post(
        '/api/copilot/programming/stream', json={'question': 'anything'}
    )

    assert response.text.endswith('data: [DONE]\n\n')


async def test_stream_of_no_tokens_still_terminates(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(copilot_router, 'stream_programming_copilot', stub_stream())

    response = await client.post(
        '/api/copilot/programming/stream', json={'question': 'anything'}
    )

    assert response.text == 'data: [DONE]\n\n'
