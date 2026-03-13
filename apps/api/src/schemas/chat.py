from __future__ import annotations

from datetime import datetime
from typing import List

from pydantic import BaseModel


class StartChatRequest(BaseModel):
    """Request body to start or open a chat with another person."""

    target_person_id: str


class StartChatResponse(BaseModel):
    """Response when (re)starting a chat with someone."""

    conversation_id: str


class MessageItem(BaseModel):
    """Single chat message."""

    id: str
    conversation_id: str
    sender_id: str
    body: str
    created_at: datetime
    is_mine: bool


class ConversationPeer(BaseModel):
    """The other person in a 1:1 conversation."""

    id: str
    display_name: str | None = None


class ConversationSummary(BaseModel):
    """Summary item for inbox list."""

    id: str
    peer: ConversationPeer
    last_message_preview: str | None = None
    last_message_at: datetime | None = None


class ConversationDetail(BaseModel):
    """Full conversation with recent messages."""

    id: str
    peer: ConversationPeer
    messages: List[MessageItem]


class SendMessageRequest(BaseModel):
    """Send a new chat message."""

    body: str


