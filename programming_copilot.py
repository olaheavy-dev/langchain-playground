from dotenv import load_dotenv, main
from langchain.chat_models import init_chat_model
from langchain_protocol import Any
from langchain.messages import HumanMessage, AIMessage, SystemMessage

load_dotenv()

def ask_programming_copilot(question: str) -> str:

    model = init_chat_model(
        model='gpt-4.1-mini',  # OPEN_API_KEY, langchain[openai]
        temperature=0.1
    )
    conversation = [
        SystemMessage(content="You are a helpful assistant for questions regarding programming."),
        HumanMessage(content='What is Python?'),
        AIMessage(content='Python is a high-level, interpreted programming language known for its simplicity and readability. It is widely used for web development, data analysis, artificial intelligence, scientific computing, and more. Python supports multiple programming paradigms, including procedural, object-oriented, and functional programming.'),
    ]

    chunks = []
    for chunk in model.stream(conversation + [HumanMessage(content=question)]):
        print(chunk.text, end='', flush=True)
        chunks.append(chunk.text)
    print()
    return ''.join(chunks)


if __name__ == '__main__':
    ask_programming_copilot('When is an LLM used?')