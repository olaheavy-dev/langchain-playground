"""Plain chat model: one request, one complete answer."""

from langchain.messages import AIMessage, HumanMessage, SystemMessage

from app.agents.base import get_model

# A seeded exchange that shows the model the tone and depth we want back.
CONVERSATION = [
    SystemMessage(content='You are a helpful assistant for questions regarding python.'),
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


async def ask_python_copilot(question: str) -> str:
    model = get_model(temperature=0.1)
    response = await model.ainvoke(CONVERSATION + [HumanMessage(content=question)])
    return response.text
