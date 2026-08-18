import json
from collections.abc import AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.agents.python_copilot import ask_python_copilot
from app.agents.streaming_copilot import stream_programming_copilot
from app.schemas import AskRequest, AskResponse

router = APIRouter(prefix='/api/copilot', tags=['copilot'])


@router.post('/python', response_model=AskResponse)
async def ask_python(request: AskRequest) -> AskResponse:
    """Answer a Python question in one shot, once the model has finished."""
    return AskResponse(answer=await ask_python_copilot(request.question))


async def _to_sse(question: str) -> AsyncIterator[str]:
    """Wrap each token as a server-sent event.

    Tokens are JSON-encoded because a raw token may contain newlines, and a
    newline is what separates one SSE message from the next.
    """
    async for token in stream_programming_copilot(question):
        yield f'data: {json.dumps({"token": token})}\n\n'
    yield 'data: [DONE]\n\n'


@router.post('/programming/stream')
async def stream_programming(request: AskRequest) -> StreamingResponse:
    """Answer a programming question, sending each token as it is produced."""
    return StreamingResponse(
        _to_sse(request.question),
        media_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',  # stop nginx buffering the stream in production
        },
    )
