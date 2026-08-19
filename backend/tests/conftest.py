"""Shared fixtures.

The environment is set before anything imports the app, because app.main reads
settings at import time. Environment variables take priority over .env in
pydantic-settings, so a real key is never needed -- and never used -- to run
these tests.
"""

import os

os.environ['OPENAI_API_KEY'] = 'test-key-not-used'
os.environ['MODEL_NAME'] = 'gpt-4.1-mini'

from collections.abc import AsyncIterator  # noqa: E402

import httpx  # noqa: E402
import pytest  # noqa: E402
from langchain.tools import ToolRuntime  # noqa: E402

from app.agents.weather import Context  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    """Drives the app in-process over ASGI, so no port is bound and no server
    needs to be running."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url='http://test') as client:
        yield client


@pytest.fixture
def runtime_for():
    """Builds a minimal ToolRuntime, standing in for the one LangGraph injects
    when a tool is called inside the agent loop."""

    def build(user_id: str) -> ToolRuntime[Context]:
        return ToolRuntime(
            state=None,
            context=Context(user_id=user_id),
            config={},
            stream_writer=lambda _: None,
            tool_call_id='test-call',
            store=None,
        )

    return build


@pytest.fixture
def mock_wttr(monkeypatch: pytest.MonkeyPatch):
    """Replace the transport underneath httpx.AsyncClient, so get_weather runs
    its real code but never leaves the process."""

    def install(handler):
        real_client = httpx.AsyncClient

        def factory(**kwargs):
            return real_client(transport=httpx.MockTransport(handler), **kwargs)

        monkeypatch.setattr(httpx, 'AsyncClient', factory)

    return install
