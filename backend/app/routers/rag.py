from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.agents.rag import ask_rag_agent
from app.schemas import RagReply

router = APIRouter(prefix='/api/rag', tags=['rag'])


class RagRequest(BaseModel):
    question: str = Field(min_length=1)
    thread_id: str = Field(description='Identifies the conversation, used for agent memory')


@router.post('', response_model=RagReply)
async def ask(request: RagRequest) -> RagReply:
    """Answer from a small knowledge base, showing what was retrieved.

    The model decides whether to search at all, so an empty `sources` list means
    it answered without consulting the knowledge base.
    """
    return await ask_rag_agent(question=request.question, thread_id=request.thread_id)
