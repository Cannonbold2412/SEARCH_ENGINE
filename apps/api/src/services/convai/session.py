"""
In-memory session store for Vapi ConvAI conversations.

Maps conversation_id -> (user_id, ConvaiSessionState).
For production with multiple instances, use Redis or a durable store.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# conversation_id -> (user_id: str, state: ConvaiSessionState)
_sessions: dict[str, tuple[str, "ConvaiSessionState"]] = {}


@dataclass
class ConvaiSessionState:
    """State for one voice conversation."""

    builder_session_id: str | None = None
    last_reply: str | None = None
    last_user_message: str | None = None
    last_user_message_count: int = 0
    pending_commit: bool = False


def create_session(
    conversation_id: str,
    user_id: str,
    *,
    reset: bool = False,
) -> ConvaiSessionState:
    """
    Create or reuse a session for this conversation.

    By default we reuse an existing session so reconnecting voice can continue
    from the same Builder thread instead of restarting. Pass reset=True to force
    a fresh conversation state.
    """
    existing = _sessions.get(conversation_id)
    if existing and not reset:
        existing_user_id, state = existing
        if existing_user_id != user_id:
            logger.warning(
                "ConvAI session user mismatch for conversation_id=%s (existing=%s new=%s); resetting",
                conversation_id,
                existing_user_id,
                user_id,
            )
        else:
            logger.info(
                "ConvAI session reused: conversation_id=%s user_id=%s",
                conversation_id,
                user_id,
            )
            return state

    state = ConvaiSessionState()
    _sessions[conversation_id] = (user_id, state)
    logger.info(
        "ConvAI session created: conversation_id=%s user_id=%s reset=%s",
        conversation_id,
        user_id,
        reset,
    )
    return state


def get_session(conversation_id: str) -> tuple[str, ConvaiSessionState] | None:
    """Get (user_id, state) for a conversation, or None."""
    return _sessions.get(conversation_id)


def delete_session(conversation_id: str) -> None:
    """Remove a session."""
    if conversation_id in _sessions:
        del _sessions[conversation_id]
        logger.info("ConvAI session deleted: conversation_id=%s", conversation_id)
