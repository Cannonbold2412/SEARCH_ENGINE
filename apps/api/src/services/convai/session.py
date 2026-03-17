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


def create_session(conversation_id: str, user_id: str) -> ConvaiSessionState:
    """Create a new session for this conversation."""
    state = ConvaiSessionState()
    _sessions[conversation_id] = (user_id, state)
    logger.info("ConvAI session created: conversation_id=%s user_id=%s", conversation_id, user_id)
    return state


def get_session(conversation_id: str) -> tuple[str, ConvaiSessionState] | None:
    """Get (user_id, state) for a conversation, or None."""
    return _sessions.get(conversation_id)


def delete_session(conversation_id: str) -> None:
    """Remove a session."""
    if conversation_id in _sessions:
        del _sessions[conversation_id]
        logger.info("ConvAI session deleted: conversation_id=%s", conversation_id)
