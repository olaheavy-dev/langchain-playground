from dotenv import load_dotenv

from weather_agent import ask_weather_agent
from python_copilot import ask_python_copilot
from programming_copilot import ask_programming_copilot

load_dotenv()


def main():
    print("------ Weather Agent ------\n")
    print(ask_weather_agent('ABC123').summary)
    print(ask_weather_agent('XYZ456').summary)
    print(ask_weather_agent('HJKL111').summary)
    print("------ Weather Agent ------\n")
    
    print("------ Chat Model ------\n")
    print(ask_python_copilot('When was python released?'))
    print("------ Chat Model ------\n")

    print("------ Streaming Copilot ------\n")
    ask_programming_copilot('When is an LLM used?')  # prints as it streams, no print() wrapper
    print("------ Streaming Copilot ------\n")



if __name__ == '__main__':
    main()
