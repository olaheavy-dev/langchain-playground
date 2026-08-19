from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.agents.weather import ask_weather_agent
from app.routers.progress_stream import SSE_HEADERS, stream_run
from app.schemas import WeatherReply, WeatherRequest

router = APIRouter(prefix='/api/weather', tags=['weather'])


@router.post('', response_model=WeatherReply)
async def get_weather(request: WeatherRequest) -> WeatherReply:
    """Look up the user's city from their id, then report its weather.

    The city is never sent by the caller -- the agent calls locate_user to find
    it, then feeds that into get_weather.
    """
    return await ask_weather_agent(user_id=request.user_id, thread_id=request.thread_id)


@router.post('/stream')
async def get_weather_streaming(request: WeatherRequest) -> StreamingResponse:
    """The same lookup, reporting each step as it finishes.

    An agent that calls two tools takes several seconds, and a spinner says
    nothing about which of them is slow. This is the same work with the trace
    drawn as it happens.
    """
    return StreamingResponse(
        stream_run(
            lambda: ask_weather_agent(user_id=request.user_id, thread_id=request.thread_id)
        ),
        media_type='text/event-stream',
        headers=SSE_HEADERS,
    )
