"""Adapter: bridge Vapi chat messages to the Builder conversation engine."""

from __future__ import annotations

import logging
import json

from sqlalchemy.ext.asyncio import AsyncSession

from src.services.builder import process_builder_turn
from .session import ConvaiSessionState

logger = logging.getLogger(__name__)


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

    if not user_content:
        return "Tell me about something you've worked on or spent real energy on lately. I'll help make sense of what stands out."

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
        return result.get("assistant_message") or "Tell me a little more about that."
    except Exception as e:
        logger.exception("convai builder turn failed: %s", e)
        return "Something went wrong on my side. Could you try saying that again in a different way?"
