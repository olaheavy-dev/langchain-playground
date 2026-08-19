# Design decisions

## Nullable readings
An unrecognised user id resolves to Unknown. Rather than let the model invent a plausible
0.0, every weather reading is nullable, so a failed lookup returns null and the interface has
to show it. A fabricated zero reads as a real measurement and is worse than an error.

## One schema, two jobs
WeatherResponse is both the agent's response_format and the base of the model the endpoint
returns, so the API contract and the structure the model must fill in cannot drift apart. The
trace lives on the reply alone, because timings belong to the server and putting them on the
response_format would invite the model to invent them.

## Where OpenAI clients are built
Every client is constructed in agents/base.py and takes its key explicitly. pydantic-settings
reads .env into a settings object but never writes os.environ, which is the only place the
OpenAI SDK looks, so a client built anywhere else fails with a misleading Missing credentials
error.

## A failing tool answers rather than raises
kb_search reports failure back to the model instead of raising. A tool that raises never
produces a tool message, which leaves an unanswered tool call in the checkpoint, and that
state is replayed on every later request, so one failure breaks the conversation permanently.

## Rate limiting and cost
Every API route calls a paid model and none of them asks who is calling, so a public
deployment caps requests per client per minute. The counters live in the process, so several
workers each get their own allowance.

## State
Conversation state uses an in-memory checkpointer, so history is lost on restart and is not
shared between workers. A database-backed checkpointer has the same interface and would be a
one-line change.

## Warming the knowledge base
The vector store is embedded at startup rather than during the first search. Built lazily it
cost 2.7 seconds on the first search against 200 milliseconds on every one after it. Moving
the work to startup does not make it cheaper, but a platform holds traffic until startup
finishes, so a machine waking pays it instead of a visitor. Failing to warm is logged rather
than fatal, because three of the four endpoints never touch the vector store.
