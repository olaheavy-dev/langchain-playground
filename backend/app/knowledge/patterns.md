# The four patterns

## Tool-calling agent
The caller sends a user id and nothing else. The agent calls locate_user to resolve that id
to a city, then feeds the result into get_weather, which reads a live weather API. The model
decides both calls and their order. Output is a typed structure rather than prose, using the
same Pydantic model that defines the HTTP response.

## Chat model
No tools and no agent loop. A seeded system, human and AI exchange steers tone and depth,
then a single ainvoke returns the finished answer. Nothing is visible until everything is.

## Agentic retrieval
The knowledge base is a tool rather than a fixed step, so the model decides whether a
question needs searching at all, and may search more than once before answering. Every
passage it retrieved is shown with the answer and its similarity score.

## Streaming chat model
The same model driven by astream. Tokens are pushed to the browser over server-sent events
and rendered as they arrive. The request can be cancelled mid-flight, and the answer scrolls
inside its own panel rather than growing the page.
