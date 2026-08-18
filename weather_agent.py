from dataclasses import dataclass

import requests
from dotenv import load_dotenv

from langchain.agents import create_agent
from langchain.tools import tool, ToolRuntime
from langchain.chat_models import init_chat_model
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer

load_dotenv()

@dataclass
class Context:
    user_id: str
    
@dataclass
class ResponseFormat:
    summary: str
    # None when the location could not be determined, so callers never see a fabricated 0.0
    temperature_celsius: float | None = None
    temperature_fahrenheit: float | None = None
    humidity: float | None = None

@tool('get_weather', return_direct=False, description="Return weather information for a given city.")
def get_weather(city: str) -> str:
    response = requests.get(f'https://wttr.in/{city}?format=j1')
    return response.json()

@tool('locate_user', description="Look up a user's city based on their context")
def locate_user(runtime: ToolRuntime[Context]):
    match runtime.context.user_id:
        case  'ABC123':
            return 'Vienna'
        case  'XYZ456':
            return 'London'
        case 'HJKL111':
            return 'Paris'
        case _:
            return 'Unknown'
        
model = init_chat_model('gpt-4.1-mini',temperature=0.3)
checkpointer = InMemorySaver(
    # Allow our own dataclasses to be restored from saved conversation state
    serde=JsonPlusSerializer(allowed_msgpack_modules=[Context, ResponseFormat])
)

agent = create_agent(
    model=model,  # Use the initialized model instance
    tools=[get_weather, locate_user],
    system_prompt="You are a helpful weather assistant, who always cracks jokes and is humorous while remaining helpful.",
    context_schema=Context,
    response_format = ResponseFormat,
    checkpointer=checkpointer
)

def ask_weather_agent(user_id: str) -> ResponseFormat:

    config: RunnableConfig = {'configurable': {'thread_id': user_id}}
    response = agent.invoke(
        {
            'messages': [
                {
                    'role': 'user',
                    'content': 'What is the weather like where I am?'
                },
            ],
        },
        config=config,
        context=Context(user_id=user_id),
    )
    #return response['messages'][-1].content  # The content of the last message in the response
    return response['structured_response']  # Already a ResponseFormat instance

if __name__ == '__main__':
    print(ask_weather_agent('ABC123'))