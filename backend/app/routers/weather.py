from fastapi import APIRouter

from app.agents.weather import ask_weather_agent
from app.schemas import WeatherReply, WeatherRequest

router = APIRouter(prefix='/api/weather', tags=['weather'])


@router.post('', response_model=WeatherReply)
async def get_weather(request: WeatherRequest) -> WeatherReply:
    """Look up the user's city from their id, then report its weather.

    The city is never sent by the caller -- the agent calls locate_user to find
    it, then feeds that into get_weather.
    """
    return await ask_weather_agent(user_id=request.user_id, thread_id=request.thread_id)
