"""Agentic retrieval: the model decides when to search, and may search twice.

Not a fixed retrieve-then-generate chain. The knowledge base is exposed as a
tool, so the model chooses whether a question needs it at all -- which means the
interesting cases are visible: a question answered without searching, and a
question that took two searches to answer.
"""

import logging
from contextvars import ContextVar
from functools import lru_cache

from langchain.agents import create_agent
from langchain.tools import tool
from langchain_core.runnables import RunnableConfig
from langchain_core.vectorstores import InMemoryVectorStore
from langgraph.checkpoint.memory import InMemorySaver

from app.agents.base import get_embeddings, get_model
from app.agents.middleware import TracingMiddleware
from app.agents.timing import finish, start_collecting
from app.schemas import RagReply, Source

SYSTEM_PROMPT = (
    'You are a helpful assistant with access to a small knowledge base of '
    "someone's stated opinions about fruit and computers.\n\n"
    'For any question about what this person likes, dislikes, or owns, call '
    'kb_search first and answer only from what it returns. You may search more '
    'than once if the first search does not cover the question. If the '
    'knowledge base does not answer it, say so plainly rather than filling the '
    'gap from your own knowledge.'
)

# The knowledge base. Deliberately small and opinionated: with eight short
# statements you can see exactly which ones a question pulled back, which is
# hard with a corpus large enough to hide the retrieval behind plausibility.
DOCUMENTS = [
    'I love apples.',
    'I enjoy oranges.',
    'I think pears taste very good.',
    'I hate bananas.',
    'I dislike raspberries.',
    'I despise mangos.',
    'I am a fan of MacBooks.',
    'I like Lenovo Thinkpads.',
    'I love Linux.',
    'I hate Windows.',
]

RETRIEVE_COUNT = 3

logger = logging.getLogger(__name__)

# Passages retrieved while serving the current request, so the answer can be
# shown alongside what it was drawn from.
_sources: ContextVar[list[Source]] = ContextVar('sources')


@lru_cache
def _get_store() -> InMemoryVectorStore:
    """Embedded once on first use rather than at import, so the module can be
    imported without an API key present.

    InMemoryVectorStore rather than FAISS: for ten short strings the index
    structure buys nothing, and it avoids depending on langchain-community,
    which is being sunset. The interface is the same, so swapping in a real
    store later is a one-line change.
    """
    return InMemoryVectorStore.from_texts(DOCUMENTS, embedding=get_embeddings())


@tool('kb_search', description='Search the knowledge base of stated opinions about fruit and computers.')
def kb_search(query: str) -> str:
    """Return the passages closest to the query, and remember them for display."""
    try:
        hits = _get_store().similarity_search_with_score(query, k=RETRIEVE_COUNT)
        collected = _sources.get(None)
        if collected is not None:
            collected.extend(
                Source(text=document.page_content, score=score, query=query)
                for document, score in hits
            )
        return '\n'.join(document.page_content for document, _ in hits)
    except Exception as error:  # noqa: BLE001 -- deliberately broad, see below
        # Report the failure to the model rather than raising. A tool that
        # raises never produces a tool message, which leaves an assistant turn
        # with an unanswered tool call in the checkpoint -- and because that
        # state is replayed on the next request, the whole thread stays broken
        # for good. Answering with the failure keeps the conversation valid and
        # lets the model say it could not search.
        #
        # Logged loudly, because handling it this way means the request still
        # returns 200 and the access log looks perfectly healthy. Without this
        # line a broken knowledge base is invisible from the server side, and
        # the only symptom is the model apologising in the answer.
        logger.exception('kb_search failed for query %r', query)
        return f'The knowledge base could not be searched: {error}'


@lru_cache
def _get_agent():
    return create_agent(
        model=get_model(temperature=0.1),
        tools=[kb_search],
        system_prompt=SYSTEM_PROMPT,
        middleware=[TracingMiddleware()],
        checkpointer=InMemorySaver(),
    )


async def ask_rag_agent(question: str, thread_id: str) -> RagReply:
    _sources.set([])
    started = start_collecting()

    config: RunnableConfig = {'configurable': {'thread_id': thread_id}}
    response = await _get_agent().ainvoke(
        {'messages': [{'role': 'user', 'content': question}]},
        config=config,
    )

    return RagReply(
        answer=response['messages'][-1].text,
        sources=_sources.get([]),
        trace=finish(started),
    )
