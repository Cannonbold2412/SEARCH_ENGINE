"""Business logic for 1:1 in-app chat conversations."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import Conversation, Message, Person
from src.schemas import (
    ConversationDetail,
    ConversationPeer,
    ConversationSummary,
    MessageItem,
    SendMessageRequest,
    StartChatRequest,
    StartChatResponse,
)
from src.services.credits import deduct_credits


async def _get_or_create_conversation(
    db: AsyncSession,
    current_user_id: str,
    target_person_id: str,
) -> Conversation:
    """Return existing conversation between two users or create a new one.

    On first creation, deduct 1 credit from the initiator. Subsequent calls
    return the same conversation without extra charges.
    """
    if current_user_id == target_person_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot start a chat with yourself",
        )

    # Canonical pair ordering
    a_id, b_id = sorted([current_user_id, target_person_id])

    existing_stmt = select(Conversation).where(
        and_(Conversation.person_a_id == a_id, Conversation.person_b_id == b_id)
    )
    existing = (await db.execute(existing_stmt)).scalar_one_or_none()
    if existing:
        return existing

    # First time: create and charge 1 credit
    conv = Conversation(person_a_id=a_id, person_b_id=b_id)
    db.add(conv)
    await db.flush()

    # Charge 1 credit to the user who initiated the chat
    if not await deduct_credits(
        db,
        current_user_id,
        1,
        "chat_start",
        "conversation_id",
        conv.id,
    ):
        # Roll back the conversation if insufficient credits
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Insufficient credits",
        )

    return conv


def _peer_for(conversation: Conversation, current_user_id: str) -> str:
    """Return the other participant id in the conversation."""
    if conversation.person_a_id == current_user_id:
        return conversation.person_b_id
    if conversation.person_b_id == current_user_id:
        return conversation.person_a_id
    raise HTTPException(status_code=403, detail="Not a participant in this conversation")


async def start_chat(
    db: AsyncSession,
    current_user: Person,
    body: StartChatRequest,
) -> StartChatResponse:
    """Start or reopen a chat with another person, charging 1 credit if new."""
    target = await db.get(Person, body.target_person_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target person not found")

    conv = await _get_or_create_conversation(db, current_user.id, target.id)
    return StartChatResponse(conversation_id=conv.id)


async def list_conversations(
    db: AsyncSession,
    current_user: Person,
) -> list[ConversationSummary]:
    """List all conversations for the current user, with latest message previews."""
    stmt = (
        select(Conversation)
        .where(
            or_(
                Conversation.person_a_id == current_user.id,
                Conversation.person_b_id == current_user.id,
            )
        )
        .order_by(Conversation.last_message_at.desc().nullslast(), Conversation.created_at.desc())
    )
    conversations: Iterable[Conversation] = (await db.execute(stmt)).scalars().all()

    if not conversations:
        return []

    # Load peers and last messages in batches
    peer_ids = {
        _peer_for(conv, current_user.id)
        for conv in conversations  # type: ignore[arg-type]
    }
    peers = (await db.execute(select(Person).where(Person.id.in_(peer_ids)))).scalars().all()
    peer_map = {p.id: p for p in peers}

    summaries: list[ConversationSummary] = []
    for conv in conversations:
        peer_id = _peer_for(conv, current_user.id)
        peer = peer_map.get(peer_id)
        peer_schema = ConversationPeer(
            id=peer_id,
            display_name=peer.display_name if peer else None,
        )

        # Fetch latest message for preview
        msg_stmt = (
            select(Message)
            .where(Message.conversation_id == conv.id)
            .order_by(Message.created_at.desc())
            .limit(1)
        )
        last_msg = (await db.execute(msg_stmt)).scalar_one_or_none()

        summaries.append(
            ConversationSummary(
                id=conv.id,
                peer=peer_schema,
                last_message_preview=last_msg.body if last_msg else None,
                last_message_at=conv.last_message_at,
            )
        )
    return summaries


async def get_conversation_detail(
    db: AsyncSession,
    current_user: Person,
    conversation_id: str,
    limit: int = 50,
) -> ConversationDetail:
    """Return a conversation with the most recent messages."""
    conv = await db.get(Conversation, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    _peer_for(conv, current_user.id)  # raises if not participant
    peer_id = _peer_for(conv, current_user.id)

    peer = await db.get(Person, peer_id)
    peer_schema = ConversationPeer(
        id=peer_id,
        display_name=peer.display_name if peer else None,
    )

    msg_stmt = (
        select(Message)
        .where(Message.conversation_id == conv.id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    messages = list((await db.execute(msg_stmt)).scalars().all())
    messages.reverse()  # oldest first for display

    message_items = [
        MessageItem(
            id=m.id,
            conversation_id=m.conversation_id,
            sender_id=m.sender_id,
            body=m.body,
            created_at=m.created_at,
            is_mine=(m.sender_id == current_user.id),
        )
        for m in messages
    ]

    return ConversationDetail(id=conv.id, peer=peer_schema, messages=message_items)


async def send_message(
    db: AsyncSession,
    current_user: Person,
    conversation_id: str,
    body: SendMessageRequest,
) -> MessageItem:
    """Send a new message in an existing conversation."""
    conv = await db.get(Conversation, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    _peer_for(conv, current_user.id)  # raises if not participant

    text = (body.body or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message body cannot be empty")

    msg = Message(conversation_id=conv.id, sender_id=current_user.id, body=text)
    db.add(msg)

    conv.last_message_at = datetime.now(UTC)
    db.add(conv)

    await db.flush()

    return MessageItem(
        id=msg.id,
        conversation_id=msg.conversation_id,
        sender_id=msg.sender_id,
        body=msg.body,
        created_at=msg.created_at,
        is_mine=True,
    )
