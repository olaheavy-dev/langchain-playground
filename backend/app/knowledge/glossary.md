# LangChain terms, and how this project uses them

## Chat model
The interface to a language model: messages in, a message out. Built here through
init_chat_model in agents/base.py, which is also the only place an API key is supplied.
Used directly by the two copilots, which have no agent loop at all — one ainvoke, one answer.

## Agent
A loop rather than a call: the model is given tools, decides which to invoke, reads the
results, and decides again, until it answers. create_agent builds that loop. The weather
agent goes round it three times, which is why its trace shows three model segments rather
than one.

## Tool
A function the model may choose to call, described to it by name, docstring and argument
schema. The @tool decorator turns a Python function into one. This project has three:
locate_user, get_weather and kb_search.

## Tool call and tool message
The model does not run a tool; it emits a tool call, and something else runs it and returns
a tool message. The pairing is strict: every tool call must be answered. A tool that raises
never produces its message, which leaves an unanswered call in the conversation and breaks
every later turn on that thread.

## ToolRuntime and context_schema
Per-request data a tool can read but the model cannot see or choose. locate_user takes no
model-visible arguments at all: the user id arrives through ToolRuntime, so the model has no
way to look up somebody else.

## response_format
A schema the agent must fill in, so the result is a typed object rather than prose. The
weather agent uses WeatherResponse, which doubles as the HTTP response model. Anything on it
is something the model has to produce, which is why timings live elsewhere.

## Structured output
The general name for making a model return data rather than text. Its failure mode is worth
knowing: a required field will be filled in whether or not the model knows the answer, which
is why every weather reading is nullable.

## Checkpointer
Where an agent's conversation is stored between requests, keyed by thread_id. This project
uses InMemorySaver, so history is lost on restart and is not shared between workers. Swapping
in a database-backed checkpointer is a one-line change.

## thread_id
Identifies a conversation, as distinct from the user having it. The weather panel gives each
user a durable thread; the retrieval panel starts a fresh one per question, because a shared
thread lets the agent answer from memory instead of searching.

## AgentMiddleware
Hooks around the agent loop: before and after the agent, and around each model call and each
tool call. TracingMiddleware wraps both, which is how every segment of the trace is measured
where it happens rather than inferred by subtraction.

## Streaming
astream instead of ainvoke: the model yields tokens as it produces them. The copilot streams
tokens to the browser over server-sent events; the agents stream their finished steps over
the same transport, which is a different thing sharing a mechanism.

## Embeddings
A model that turns text into a vector, so that similar meanings sit near each other.
text-embedding-3-large here, built in agents/base.py alongside the chat model for the same
reason: so no client is ever constructed without a key.

## Vector store
Holds embedded text and finds the nearest matches to a query. This project uses
InMemoryVectorStore over ten documents, which needs no index and no extra dependency; the
interface is the same as a real store, so swapping one in is a small change.

## Retrieval and RAG
Fetching relevant text and giving it to the model so the answer is grounded in documents
rather than in what the model happens to remember. Here retrieval is a tool the model may
call rather than a fixed step, so it decides whether a question needs the knowledge base at
all — and the passages it retrieved are shown with the answer.

## usage_metadata
Token counts a model returns alongside its answer: input, output, and how much of the input
was served from the provider's cache. Summed across every model call in a turn to report
what a request cost.

## LangGraph
The graph runtime underneath the agent. It supplies the loop, the checkpointer and the tool
node, and it is what runs several tool calls concurrently when the model asks for them
together — which is why trace segments can overlap.
