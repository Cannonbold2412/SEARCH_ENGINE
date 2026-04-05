"""Builder session state management helpers."""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime
from typing import Any

_extract_schema_jobs: dict[str, dict[str, Any]] = {}
_extract_schema_jobs_lock = asyncio.Lock()
_builder_sessions: dict[str, dict[str, Any]] = {}
_builder_sessions_lock = asyncio.Lock()


def _session_status_for(*, turn_count: int, stop_ready: bool, committed: bool) -> str:
    if committed:
        return "committed"
    if stop_ready:
        return "ready_to_commit"
    if turn_count >= 4:
        return "deepening"
    return "discovering"


def _hidden_state_to_dict(state: dict[str, Any] | None) -> dict[str, Any]:
    # Vapi manages memory externally; backend keeps no structured hidden state.
    return state if isinstance(state, dict) else {}


def _visible_turns_to_payload(turns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def _serialize_datetime(value: Any) -> Any:
        # Prompt builders embed visible turns as JSON; ensure datetimes are serializable.
        if value is None:
            return None
        iso = getattr(value, "isoformat", None)
        return iso() if callable(iso) else str(value)

    return [
        {
            "id": turn["id"],
            "role": turn["role"],
            "content": turn["content"],
            "turn_index": turn["turn_index"],
            "message_type": turn["message_type"],
            "created_at": _serialize_datetime(turn.get("created_at")),
        }
        for turn in turns
        if turn["role"] in {"user", "assistant"}
    ]


def _derive_surfaced_insights(
    hidden_state: dict[str, Any], explicit: list[str] | None = None
) -> list[str]:
    insights = [item.strip() for item in (explicit or []) if isinstance(item, str) and item.strip()]
    return insights[:3]


def _next_turn_index(session: dict[str, Any]) -> int:
    turns = session.get("turns") or []
    if not turns:
        return 1
    return int(turns[-1].get("turn_index") or 0) + 1


def _append_turn(
    *,
    session: dict[str, Any],
    role: str,
    content: str,
    message_type: str,
    count_toward_session: bool = True,
) -> dict[str, Any]:
    turn = {
        "id": str(uuid.uuid4()),
        "session_id": session["id"],
        "role": role,
        "content": content,
        "message_type": message_type,
        "turn_index": _next_turn_index(session),
        "created_at": datetime.now(UTC),
    }
    session["turns"].append(turn)
    if count_toward_session:
        session["turn_count"] = int(session.get("turn_count") or 0) + 1
    return turn


def _load_turns(session: dict[str, Any]) -> list[dict[str, Any]]:
    turns = list(session.get("turns") or [])
    return sorted(turns, key=lambda t: int(t.get("turn_index") or 0))


async def _resolve_session(
    *,
    person_id: str,
    session_id: str | None,
    allow_committed_session: bool = False,
) -> dict[str, Any] | None:
    if not session_id:
        return None

    async with _builder_sessions_lock:
        maybe = _builder_sessions.get(session_id)
        if not maybe or maybe.get("person_id") != person_id:
            return None
        if maybe.get("status") == "archived":
            return None
        if maybe.get("status") == "committed" and not allow_committed_session:
            return None
        return maybe


async def _load_session_with_state(
    *,
    person_id: str,
    session_id: str | None,
    mode: str,
    allow_committed_session: bool = False,
) -> tuple[dict[str, Any], dict[str, Any]]:
    session = await _resolve_session(
        person_id=person_id,
        session_id=session_id,
        allow_committed_session=allow_committed_session,
    )

    if session is None:
        sid = str(uuid.uuid4())
        session = {
            "id": sid,
            "person_id": person_id,
            "mode": mode if mode in {"text", "voice"} else "text",
            "status": "discovering",
            "current_focus": None,
            "working_narrative": None,
            "turn_count": 0,
            "stop_confidence": 0.0,
            "turns": [],
            "hidden_state": {},
        }
        async with _builder_sessions_lock:
            _builder_sessions[sid] = session
        return session, session["hidden_state"]

    session["mode"] = mode if mode in {"text", "voice"} else session.get("mode", "text")
    if not isinstance(session.get("hidden_state"), dict):
        session["hidden_state"] = {}
    return session, session["hidden_state"]


def get_extract_schema_job(session_id: str) -> dict[str, Any] | None:
    """Return in-memory background job status for a session if available."""
    job = _extract_schema_jobs.get(session_id)
    return dict(job) if isinstance(job, dict) else None


async def _mark_extract_schema_job_running(session_id: str) -> bool:
    async with _extract_schema_jobs_lock:
        if (_extract_schema_jobs.get(session_id) or {}).get("status") == "running":
            return False
        _extract_schema_jobs[session_id] = {
            "status": "running",
            "session_id": session_id,
            "started_at": datetime.now(UTC).isoformat(),
        }
        return True


async def _mark_extract_schema_job_failed(session_id: str, error: str) -> None:
    async with _extract_schema_jobs_lock:
        started_at = (_extract_schema_jobs.get(session_id) or {}).get("started_at")
        _extract_schema_jobs[session_id] = {
            "status": "failed",
            "session_id": session_id,
            "error": error,
            "started_at": started_at,
            "finished_at": datetime.now(UTC).isoformat(),
        }


async def _mark_extract_schema_job_completed(
    session_id: str,
    *,
    committed_card_count: int,
    session_status: str,
) -> None:
    async with _extract_schema_jobs_lock:
        started_at = (_extract_schema_jobs.get(session_id) or {}).get("started_at")
        _extract_schema_jobs[session_id] = {
            "status": "completed",
            "session_id": session_id,
            "committed_card_count": int(committed_card_count or 0),
            "session_status": session_status,
            "started_at": started_at,
            "finished_at": datetime.now(UTC).isoformat(),
        }


__all__ = [
    "_append_turn",
    "_derive_surfaced_insights",
    "_hidden_state_to_dict",
    "_load_session_with_state",
    "_load_turns",
    "_mark_extract_schema_job_completed",
    "_mark_extract_schema_job_failed",
    "_mark_extract_schema_job_running",
    "_resolve_session",
    "_session_status_for",
    "_visible_turns_to_payload",
    "get_extract_schema_job",
]
