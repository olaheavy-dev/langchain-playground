"""Warming the knowledge base at startup.

The interesting cases are the ones where warming goes wrong, because the vector
store is needed by one endpoint out of four and must not be able to take the
other three down with it.
"""

import pytest

from app import main
from app.config import get_settings


@pytest.fixture(autouse=True)
def restore_settings():
    yield
    get_settings.cache_clear()


async def test_the_store_is_built_before_any_request(monkeypatch: pytest.MonkeyPatch) -> None:
    """Built lazily, the first search paid 2.7s to embed the corpus against
    200ms for every search after it."""
    built = []
    monkeypatch.setattr(main, 'get_store', lambda: built.append('warmed'))
    monkeypatch.setattr(main.settings, 'warm_knowledge_base', True)

    async with main.lifespan(main.app):
        assert built == ['warmed']


async def test_a_failure_to_warm_does_not_stop_the_app(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """Three of the four endpoints never touch the vector store. A bad key or a
    network blip at startup must not take the weather agent and both copilots
    down with it."""

    def explode():
        raise RuntimeError('no route to host')

    monkeypatch.setattr(main, 'get_store', explode)
    monkeypatch.setattr(main.settings, 'warm_knowledge_base', True)

    with caplog.at_level('ERROR'):
        async with main.lifespan(main.app):
            pass  # started anyway

    assert 'could not warm the knowledge base' in caplog.text


async def test_warming_can_be_turned_off(monkeypatch: pytest.MonkeyPatch) -> None:
    """A reload-driven dev loop would otherwise pay for it on every restart, for
    a corpus that has not changed."""
    built = []
    monkeypatch.setattr(main, 'get_store', lambda: built.append('warmed'))
    monkeypatch.setattr(main.settings, 'warm_knowledge_base', False)

    async with main.lifespan(main.app):
        assert built == []


async def test_warming_does_not_block_the_event_loop(monkeypatch: pytest.MonkeyPatch) -> None:
    """Embedding is a blocking call. Run inline it would stall everything else
    the server is doing for its whole duration, which at startup includes
    answering the health check that decides whether the machine is ready."""
    import asyncio
    import threading

    startup_thread = []

    def record_thread():
        startup_thread.append(threading.current_thread().name)

    monkeypatch.setattr(main, 'get_store', record_thread)
    monkeypatch.setattr(main.settings, 'warm_knowledge_base', True)

    async with main.lifespan(main.app):
        pass

    assert startup_thread and startup_thread[0] != threading.current_thread().name
    assert asyncio.get_running_loop() is not None
