# LangChain Playground

Three LangChain patterns, each built the same way and served over HTTP so a frontend can
drive them:

| Pattern | Module | What it demonstrates |
| --- | --- | --- |
| Tool-calling agent | `app/agents/weather.py` | The model decides when to call your own functions, and fills a typed response |
| Chat model | `app/agents/python_copilot.py` | One request, one complete answer |
| Streaming chat model | `app/agents/streaming_copilot.py` | The same answer, sent token by token as it is produced |

## Getting started

Requires Python 3.13+ and [uv](https://docs.astral.sh/uv/).

```bash
cd backend
cp .env.example .env        # then add your OpenAI key
uv sync
uv run uvicorn app.main:app --reload
```

The API is then on <http://127.0.0.1:8000>, with interactive docs at
<http://127.0.0.1:8000/docs>.

## Endpoints

### `POST /api/weather`

Reports the weather where the user is. The city is never sent by the caller — the agent
calls `locate_user` to resolve `user_id` to a city, then feeds that into `get_weather`.

```bash
curl -X POST http://127.0.0.1:8000/api/weather \
  -H 'Content-Type: application/json' \
  -d '{"user_id": "ABC123", "thread_id": "t1"}'
```

```json
{
  "summary": "Currently in Vienna, it's about 17°C (63°F) with light rain showers...",
  "temperature_celsius": 17.0,
  "temperature_fahrenheit": 63.0,
  "humidity": 84.0
}
```

Known users are `ABC123` (Vienna), `XYZ456` (London) and `HJKL111` (Paris). Any other id
resolves to `Unknown`, and the agent says so rather than guessing — the three numeric
fields come back `null`, so callers must handle the case instead of reading a fabricated
`0.0`.

`thread_id` identifies the conversation and `user_id` the person; they are deliberately
separate, so one user can hold several independent conversations.

### `POST /api/copilot/python`

```bash
curl -X POST http://127.0.0.1:8000/api/copilot/python \
  -H 'Content-Type: application/json' \
  -d '{"question": "When was Python released?"}'
```

```json
{ "answer": "Python was first released in 1991 by its creator Guido van Rossum." }
```

### `POST /api/copilot/programming/stream`

The same model, streamed as [server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events).

```bash
curl -N -X POST http://127.0.0.1:8000/api/copilot/programming/stream \
  -H 'Content-Type: application/json' \
  -d '{"question": "What is a decorator?"}'
```

```
data: {"token": "A"}

data: {"token": " decorator"}

data: [DONE]
```

Tokens are JSON-encoded because a token may contain a newline, and newlines are what
separate one SSE message from the next.

## Layout

```
backend/
├── pyproject.toml
└── app/
    ├── main.py              # FastAPI app, CORS
    ├── config.py            # settings, read from .env
    ├── schemas.py           # request/response models
    ├── agents/
    │   ├── base.py          # shared chat model factory
    │   ├── weather.py
    │   ├── python_copilot.py
    │   └── streaming_copilot.py
    └── routers/
        ├── weather.py
        └── copilot.py
```

`WeatherResponse` in `schemas.py` is both the HTTP response model and the agent's
`response_format`, so the API contract and the structure the model must fill in are
defined once.

## Notes

- Everything is async (`ainvoke`/`astream`, `httpx` rather than `requests`) so one slow
  weather lookup cannot stall the event loop.
- Conversation memory uses an in-process `InMemorySaver`. That is fine for development,
  but history is lost on restart and is not shared between workers — swap in a
  database-backed checkpointer before running more than one process.
- The OpenAI key is passed explicitly to `init_chat_model`. pydantic-settings reads `.env`
  into the settings object but does not export the values into `os.environ`, where
  LangChain would otherwise look for them.
