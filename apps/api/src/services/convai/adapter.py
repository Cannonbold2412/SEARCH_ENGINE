"""Adapter: bridge Vapi chat messages to the Builder conversation engine."""

from __future__ import annotations

import logging
import re

from sqlalchemy.ext.asyncio import AsyncSession

from src.services.builder import process_builder_turn
from .session import ConvaiSessionState

logger = logging.getLogger(__name__)


def _normalize_user_message(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


async def convai_chat_turn(
    conversation_id: str,
    user_id: str,
    messages: list[dict],
    db: AsyncSession,
    state: ConvaiSessionState,
) -> str:
    """Process one voice turn via the conversation-first Builder engine."""
    # Get latest user message
    user_content = ""
    for m in reversed(messages):
        role = (m.get("role") or "").strip().lower()
        content = (m.get("content") or "").strip()
        if role == "user" and content:
            user_content = content
            break

    user_content_len = len(user_content or "")
    user_msgs_with_content = 0
    try:
        user_msgs_with_content = sum(
            1
            for m in messages
            if isinstance(m, dict)
            and (m.get("role") or "").strip().lower() == "user"
            and isinstance(m.get("content"), str)
            and m.get("content").strip()
        )
    except Exception:
        user_msgs_with_content = 0

    user_content = _normalize_user_message(user_content)
    if not user_content:
        return "Tell me about something you've worked on or spent real energy on lately. I'll help make sense of what stands out."

    if (
        state.last_reply
        and state.last_user_message == user_content
        and state.last_user_message_count == user_msgs_with_content
    ):
        logger.info(
            "convai duplicate user turn ignored: conversation_id=%s user_id=%s message_count=%s",
            conversation_id,
            user_id,
            user_msgs_with_content,
        )
        return state.last_reply

    try:
        # TODO(builder): allow voice calls to resume a live text session when the frontend passes one through Vapi metadata.
        result = await process_builder_turn(
            db,
            person_id=user_id,
            message=user_content,
            session_id=state.builder_session_id,
            mode="voice",
        )
        state.builder_session_id = result.get("session_id")
        state.last_reply = result.get("assistant_message")
        state.last_user_message = user_content
        state.last_user_message_count = user_msgs_with_content
        state.pending_commit = bool(result.get("ready_to_commit"))

        return result.get("assistant_message") or "Tell me a little more about that."
    except Exception as e:
        logger.exception("convai builder turn failed: %s", e)
        return "Something went wrong on my side. Could you try saying that again in a different way?"
