from dotenv import load_dotenv, main
from langchain.chat_models import init_chat_model
from langchain_protocol import Any
from langchain.messages import HumanMessage, AIMessage, SystemMessage

load_dotenv()

def ask_python_copilot(question: str) -> str | list[str | dict[Any, Any]]:

    model = init_chat_model(
        model='gpt-4.1-mini',  # OPEN_API_KEY, langchain[openai]
        temperature=0.1
    )
    
    conversation = [
        SystemMessage(content="You are a helpful assistant for questions regarding python."),
        HumanMessage(content='What is Python?'),
        AIMessage(content='Python is a high-level, interpreted programming language known for its simplicity and readability. It is widely used for web development, data analysis, artificial intelligence, scientific computing, and more. Python supports multiple programming paradigms, including procedural, object-oriented, and functional programming.'),
    ]

    response = model.invoke(conversation + [HumanMessage(content=question)])
    return response.content

if __name__ == '__main__':
    print(ask_python_copilot('When was python released?'))