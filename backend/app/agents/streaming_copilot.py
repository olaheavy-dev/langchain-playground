"""Same chat model, streamed: tokens are yielded as the model produces them.

The terminal version printed each chunk. A server cannot print its output --
stdout goes to the server's own log, not to the browser -- so this yields
instead and lets the route decide how to send them over the wire.
"""

from collections.abc import AsyncIterator

from langchain.messages import AIMessage, HumanMessage, SystemMessage

from app.agents.base import get_model

CONVERSATION = [
    SystemMessage(content='You are a helpful assistant for questions regarding programming.'),
    HumanMessage(content='What is Python?'),
    AIMessage(
        content=(
            'Python is a high-level, interpreted programming language known for its '
            'simplicity and readability. It is widely used for web development, data '
            'analysis, artificial intelligence, scientific computing, and more. Python '
            'supports multiple programming paradigms, including procedural, '
            'object-oriented, and functional programming.'
        )
    ),
]


async def stream_programming_copilot(question: str) -> AsyncIterator[str]:
    model = get_model(temperature=0.1)
    async for chunk in model.astream(CONVERSATION + [HumanMessage(content=question)]):
        if chunk.text:
            yield chunk.text
