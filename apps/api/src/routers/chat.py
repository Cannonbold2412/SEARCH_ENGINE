"""HTTP routes for 1:1 in-app chat."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import Person
from src.dependencies import get_current_user, get_db
from src.schemas import (
    ConversationDetail,
    ConversationSummary,
    MessageItem,
    SendMessageRequest,
    StartChatRequest,
    StartChatResponse,
)
from src.services import chat as chat_service

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/conversations", response_model=StartChatResponse)
async def start_chat(
    body: StartChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Person = Depends(get_current_user),
) -> StartChatResponse:
    """Start or reopen a chat with another person (costs 1 credit the first time)."""
    return await chat_service.start_chat(db, current_user, body)


@router.get("/conversations", response_model=list[ConversationSummary])
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: Person = Depends(get_current_user),
) -> list[ConversationSummary]:
    """List all chat conversations for the current user."""
    return await chat_service.list_conversations(db, current_user)


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Person = Depends(get_current_user),
) -> ConversationDetail:
    """Get a conversation with the most recent messages."""
    return await chat_service.get_conversation_detail(db, current_user, conversation_id)


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=MessageItem,
)
async def send_message(
    conversation_id: str,
    body: SendMessageRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Person = Depends(get_current_user),
) -> MessageItem:
    """Send a new message in an existing conversation."""
    return await chat_service.send_message(db, current_user, conversation_id, body)
