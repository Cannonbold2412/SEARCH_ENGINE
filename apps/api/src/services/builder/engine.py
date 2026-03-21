"""Conversation-first Builder orchestration engine."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
import os
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import get_settings
from src.db.models import (
    ExperienceCard,
    ExperienceCardChild,
)
from src.db.session import async_session
from src.serializers import experience_card_to_response, experience_card_child_to_response
from src.services.builder.roles import (
    ChatServiceError,
    fast_turn,
    fallback_director,
    fallback_reply,
    fallback_stop_decision,
    safe_hidden_state_payload,
    synthesize_commit_input,
)
from src.services.experience import (
    detect_experiences,
    embed_experience_cards,
    experience_card_service,
    run_draft_single,
)

logger = logging.getLogger(__name__)
_extract_schema_jobs: dict[str, dict[str, Any]] = {}
_extract_schema_jobs_lock = asyncio.Lock()
_builder_sessions_lock = asyncio.Lock()
_builder_sessions: dict[str, dict[str, Any]] = {}


def _debug_log(hypothesis_id: str, location: str, message: str, data: dict[str, Any]) -> None:
    # #region agent log
    try:
        payload = {
            "id": f"log_{uuid.uuid4().hex}",
            "runId": "pre-fix",
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data,
            "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
        }
        log_path = r"c:\Users\Lenovo\Desktop\Search_Engine\.cursor\debug.log"
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=True) + "\n")
    except Exception:
        pass
    # #endregion


def _normalize_adjacent_duplicate_phrases(text: str, *, max_window: int = 12) -> str:
    """
    Collapse adjacent repeated word windows caused by streaming/transcript overlap.

    Example:
      "what you did what you did and your talents and your talents"
      -> "what you did and your talents"
    """
    tokens = [token for token in (text or "").strip().split() if token]
    if len(tokens) < 2:
        return (text or "").strip()

    def _norm(token: str) -> str:
        return re.sub(r"^[^\w]+|[^\w]+$", "", token.lower())

    limit = min(max_window, len(tokens) // 2)
    changed = True
    while changed:
        changed = False
        for i in range(0, len(tokens) - 1):
            removed = False
            for size in range(limit, 0, -1):
                if i + (2 * size) > len(tokens):
                    continue
                if all(_norm(tokens[i + j]) == _norm(tokens[i + size + j]) for j in range(size)):
                    del tokens[i + size : i + (2 * size)]
                    changed = True
                    removed = True
                    break
            if removed:
                break

    return " ".join(tokens).strip()


def _hidden_state_to_dict(state: dict[str, Any] | None) -> dict[str, Any]:
    # Vapi manages memory externally; backend keeps no structured hidden state.
    return state if isinstance(state, dict) else {}


def _extract_vapi_transcript(payload: dict[str, Any]) -> str:
    transcript = payload.get("transcript")
    if isinstance(transcript, str) and transcript.strip():
        return transcript.strip()
    if isinstance(transcript, list):
        lines: list[str] = []
        for item in transcript:
            if isinstance(item, str) and item.strip():
                lines.append(item.strip())
                continue
            if isinstance(item, dict):
                role = str(item.get("role") or "").strip().lower()
                content = item.get("content")
                text = content if isinstance(content, str) else str(content or "")
                text = text.strip()
                if not text:
                    continue
                if role in {"user", "assistant"}:
                    lines.append(f"{role.title()}: {text}")
                else:
                    lines.append(text)
        if lines:
            return "\n".join(lines).strip()
    if isinstance(transcript, dict):
        lines: list[str] = []
        for key in ("text", "content", "value"):
            value = transcript.get(key)
            if isinstance(value, str) and value.strip():
                lines.append(value.strip())
        messages = transcript.get("messages")
        if isinstance(messages, list):
            for message in messages:
                if not isinstance(message, dict):
                    continue
                role = str(message.get("role") or "").strip().lower()
                content = message.get("content")
                text = content if isinstance(content, str) else str(content or "")
                text = text.strip()
                if not text:
                    continue
                if role in {"user", "assistant"}:
                    lines.append(f"{role.title()}: {text}")
                else:
                    lines.append(text)
        if lines:
            return "\n".join(lines).strip()
    return ""


async def _fetch_vapi_transcript_by_call_id(call_id: str) -> str:
    settings = get_settings()
    api_key = (settings.vapi_api_key or "").strip()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Vapi transcript fetch is not configured on server.",
        )

    base_url = (settings.vapi_api_base_url or "https://api.vapi.ai").rstrip("/")
    url = f"{base_url}/call/{call_id}"
    _debug_log(
        "H4",
        "engine.py:_fetch_vapi_transcript_by_call_id:start",
        "starting Vapi call fetch",
        {"hasApiKey": bool(api_key), "baseUrl": base_url, "callIdLength": len(call_id or "")},
    )
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                },
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.warning("vapi call fetch failed for call_id=%s status=%s", call_id, exc.response.status_code)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not fetch transcript from Vapi.",
        ) from exc
    except httpx.RequestError as exc:
        logger.warning("vapi call fetch request failed for call_id=%s: %s", call_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach Vapi to fetch transcript.",
        ) from exc

    payload = response.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Invalid Vapi call response.")
    transcript = _extract_vapi_transcript(payload)
    _debug_log(
        "H4",
        "engine.py:_fetch_vapi_transcript_by_call_id:parsed",
        "parsed Vapi transcript payload",
        {"hasPayloadDict": isinstance(payload, dict), "transcriptLength": len(transcript or "")},
    )
    if not transcript:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vapi call transcript is empty or unavailable.",
        )
    logger.info(
        "vapi transcript fetched: call_id=%s chars=%s",
        call_id,
        len(transcript),
    )
    return transcript


def _session_status_for(*, turn_count: int, stop_ready: bool, committed: bool) -> str:
    if committed:
        return "committed"
    if stop_ready:
        return "ready_to_commit"
    if turn_count >= 4:
        return "deepening"
    return "discovering"


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


def _derive_surfaced_insights(hidden_state: dict[str, Any], explicit: list[str] | None = None) -> list[str]:
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
        "created_at": datetime.now(timezone.utc),
    }
    session["turns"].append(turn)
    if count_toward_session:
        session["turn_count"] = int(session.get("turn_count") or 0) + 1
    return turn


def _load_turns(session: dict[str, Any]) -> list[dict[str, Any]]:
    turns = list(session.get("turns") or [])
    return sorted(turns, key=lambda t: int(t.get("turn_index") or 0))


async def _load_session_with_state(
    *,
    person_id: str,
    session_id: str | None,
    mode: str,
    allow_committed_session: bool = False,
) -> tuple[dict[str, Any], dict[str, Any]]:
    session: dict[str, Any] | None = None

    async with _builder_sessions_lock:
        if session_id:
            maybe = _builder_sessions.get(session_id)
            if maybe and maybe.get("person_id") == person_id:
                session = maybe
                if session.get("status") == "archived":
                    session = None
                elif session.get("status") == "committed" and not allow_committed_session:
                    session = None

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
            _builder_sessions[sid] = session
            return session, session["hidden_state"]

        session["mode"] = mode if mode in {"text", "voice"} else session.get("mode", "text")
        if not isinstance(session.get("hidden_state"), dict):
            session["hidden_state"] = {}
        return session, session["hidden_state"]


async def _finalize_card(db: AsyncSession, *, person_id: str, card_id: str) -> ExperienceCard | None:
    card = await experience_card_service.get_card(db, card_id, person_id)
    if not card:
        return None
    card.experience_card_visibility = True
    children_result = await db.execute(
        select(ExperienceCardChild).where(
            ExperienceCardChild.parent_experience_id == card.id,
            ExperienceCardChild.person_id == person_id,
        )
    )
    children = list(children_result.scalars().all())
    await embed_experience_cards(db, parents=[card], children=children)
    return card


async def commit_builder_session(
    db: AsyncSession,
    *,
    person_id: str,
    session_id: str,
) -> dict[str, Any]:
    session = _builder_sessions.get(session_id)
    if session and session.get("person_id") != person_id:
        session = None
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Builder session not found")

    if session["status"] == "committed":
        return {
            "session_id": session["id"],
            "session_status": session["status"],
            "working_narrative": session.get("working_narrative"),
            "committed_card_ids": [],
            "committed_card_count": 0,
            "cards": [],
            "children": [],
        }

    hidden_state = _hidden_state_to_dict(session.get("hidden_state"))
    turns = _load_turns(session)
    visible_turns = _visible_turns_to_payload(turns)

    extraction_input = ""
    try:
        extraction_input = await synthesize_commit_input(
            working_narrative=session.get("working_narrative") or "",
            hidden_state=hidden_state,
            visible_turns=visible_turns,
        )
    except (ChatServiceError, ValueError, json.JSONDecodeError) as exc:
        logger.warning("builder commit synthesis failed for session=%s: %s", session["id"], exc)

    if not extraction_input:
        user_lines = [
            str(turn.get("content") or "").strip()
            for turn in visible_turns
            if turn.get("role") == "user"
        ]
        extraction_input = "\n\n".join(
            [session.get("working_narrative") or ""] + [line for line in user_lines if line]
        ).strip()

    if not extraction_input:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Builder session does not have enough material to commit yet.",
        )

    commit_result = await _commit_extraction_input(
        db,
        person_id=person_id,
        extraction_input=extraction_input,
        log_context=f"session={session['id']}",
    )

    session["status"] = "committed"
    session["stop_confidence"] = max(float(session.get("stop_confidence") or 0.0), 0.8)

    return {
        "session_id": session["id"],
        "session_status": session["status"],
        "working_narrative": session.get("working_narrative"),
        "committed_card_ids": commit_result["committed_card_ids"],
        "committed_card_count": commit_result["committed_card_count"],
        "cards": commit_result["cards"],
        "children": commit_result["children"],
    }


async def _commit_extraction_input(
    db: AsyncSession,
    *,
    person_id: str,
    extraction_input: str,
    log_context: str,
) -> dict[str, Any]:
    try:
        detect_result = await detect_experiences(extraction_input)
    except Exception as exc:
        logger.warning("builder commit detect failed (%s): %s", log_context, exc)
        detect_result = {"count": 0, "experiences": []}

    experience_count = int(detect_result.get("count") or 0)
    if experience_count <= 0:
        experience_count = 1

    committed_cards: list[ExperienceCard] = []
    committed_children: list[ExperienceCardChild] = []
    for experience_index in range(1, experience_count + 1):
        families = await run_draft_single(
            db,
            person_id,
            extraction_input,
            experience_index,
            experience_count,
        )
        for family in families:
            parent = family.get("parent") or {}
            card_id = str(parent.get("id") or "").strip()
            if not card_id:
                continue
            card = await _finalize_card(db, person_id=person_id, card_id=card_id)
            if not card:
                continue
            committed_cards.append(card)
            children_result = await db.execute(
                select(ExperienceCardChild).where(
                    ExperienceCardChild.parent_experience_id == card.id,
                    ExperienceCardChild.person_id == person_id,
                )
            )
            committed_children.extend(list(children_result.scalars().all()))

    return {
        "committed_card_ids": [card.id for card in committed_cards],
        "committed_card_count": len(committed_cards),
        "cards": [experience_card_to_response(card) for card in committed_cards],
        "children": [experience_card_child_to_response(child) for child in committed_children],
    }


async def commit_builder_transcript(
    db: AsyncSession,
    *,
    person_id: str,
    call_id: str | None = None,
    transcript: str | None = None,
    session_id: str | None = None,
    mode: str = "voice",
) -> dict[str, Any]:
    resolved_call_id = str(call_id or "").strip()
    transcript_text = ""
    _debug_log(
        "H1-H4",
        "engine.py:commit_builder_transcript:start",
        "commit_builder_transcript received input",
        {
            "hasCallId": bool(resolved_call_id),
            "inputTranscriptLength": len(str(transcript or "").strip()),
            "hasSessionId": bool(str(session_id or "").strip()),
            "mode": mode,
        },
    )
    if resolved_call_id:
        transcript_text = await _fetch_vapi_transcript_by_call_id(resolved_call_id)

    if not transcript_text:
        transcript_text = str(transcript or "").strip()

    extraction_input = _normalize_adjacent_duplicate_phrases(transcript_text or "")
    _debug_log(
        "H3-H5",
        "engine.py:commit_builder_transcript:extraction",
        "computed extraction input",
        {
            "transcriptTextLength": len(transcript_text or ""),
            "extractionInputLength": len(extraction_input or ""),
        },
    )
    if not extraction_input:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either call_id or transcript is required.",
        )

    resolved_session_id = str(session_id or uuid.uuid4())
    commit_result = await _commit_extraction_input(
        db,
        person_id=person_id,
        extraction_input=extraction_input,
        log_context=f"transcript={resolved_session_id}",
    )

    return {
        "session_id": resolved_session_id,
        "session_status": "committed",
        "working_narrative": None,
        "committed_card_ids": commit_result["committed_card_ids"],
        "committed_card_count": commit_result["committed_card_count"],
        "cards": commit_result["cards"],
        "children": commit_result["children"],
        "mode": mode if mode in {"text", "voice"} else "voice",
    }


async def extract_schema(
    db: AsyncSession,
    *,
    person_id: str,
    session_id: str,
) -> dict[str, Any]:
    """
    Convert a completed builder transcript into card families and commit them.

    This keeps the extraction intent explicit while delegating the heavy lifting
    to the existing session commit pipeline.
    """
    return await commit_builder_session(
        db,
        person_id=person_id,
        session_id=session_id,
    )


def schedule_extract_schema(
    *,
    person_id: str,
    session_id: str,
) -> bool:
    """
    Queue background schema extraction for a session.

    Returns False when a job is already running for this session.
    """
    job = _extract_schema_jobs.get(session_id) or {}
    if job.get("status") == "running":
        return False
    asyncio.create_task(_run_extract_schema_job(person_id=person_id, session_id=session_id))
    return True


def get_extract_schema_job(session_id: str) -> dict[str, Any] | None:
    """Return in-memory background job status for a session if available."""
    job = _extract_schema_jobs.get(session_id)
    return dict(job) if isinstance(job, dict) else None


async def _run_extract_schema_job(*, person_id: str, session_id: str) -> None:
    async with _extract_schema_jobs_lock:
        if (_extract_schema_jobs.get(session_id) or {}).get("status") == "running":
            return
        _extract_schema_jobs[session_id] = {
            "status": "running",
            "session_id": session_id,
            "started_at": datetime.now(timezone.utc).isoformat(),
        }
    try:
        async with async_session() as db:
            try:
                result = await extract_schema(db, person_id=person_id, session_id=session_id)
                await db.commit()
            except Exception as exc:
                await db.rollback()
                logger.exception("background extract_schema failed for session=%s: %s", session_id, exc)
                _extract_schema_jobs[session_id] = {
                    "status": "failed",
                    "session_id": session_id,
                    "error": str(exc),
                    "started_at": _extract_schema_jobs.get(session_id, {}).get("started_at"),
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                }
                return
    except Exception as exc:
        logger.exception("background extract_schema setup failed for session=%s: %s", session_id, exc)
        _extract_schema_jobs[session_id] = {
            "status": "failed",
            "session_id": session_id,
            "error": str(exc),
            "started_at": _extract_schema_jobs.get(session_id, {}).get("started_at"),
            "finished_at": datetime.now(timezone.utc).isoformat(),
        }
        return

    _extract_schema_jobs[session_id] = {
        "status": "completed",
        "session_id": session_id,
        "committed_card_count": int(result.get("committed_card_count") or 0),
        "session_status": result.get("session_status") or "committed",
        "started_at": _extract_schema_jobs.get(session_id, {}).get("started_at"),
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }


async def process_builder_turn(
    db: AsyncSession,
    *,
    person_id: str,
    message: str,
    session_id: str | None = None,
    mode: str = "text",
) -> dict[str, Any]:
    content = _normalize_adjacent_duplicate_phrases(message or "")
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="message is required")

    session, hidden_state_model = await _load_session_with_state(
        person_id=person_id,
        session_id=session_id,
        mode=mode,
        allow_committed_session=mode == "voice",
    )

    _append_turn(
        session=session,
        role="user",
        content=content,
        message_type="story",
    )

    turns = _load_turns(session)
    visible_turns = _visible_turns_to_payload(turns)
    hidden_state = _hidden_state_to_dict(hidden_state_model)

    # Unified single-call pipeline (replaces the old sequential narrative/talent/stop/director/reply pipeline).
    try:
        fast_result = await fast_turn(
            working_narrative=session.get("working_narrative") or "",
            hidden_state=hidden_state,
            visible_turns=visible_turns,
            turn_count=int(session.get("turn_count") or 0),
            mode=mode,
        )
    except Exception as exc:
        logger.warning("builder fast_turn failed for session=%s: %s", session["id"], exc)
        stop_decision = fallback_stop_decision(hidden_state=hidden_state, turn_count=int(session.get("turn_count") or 0))
        director_plan = fallback_director(stop_decision=stop_decision, hidden_state=hidden_state)
        reply = fallback_reply(
            director_plan=director_plan,
            stop_decision=stop_decision,
            hidden_state=hidden_state,
        )
        fast_result = {
            "working_narrative": session.get("working_narrative") or "",
            "hidden_state": safe_hidden_state_payload(hidden_state),
            "stop_decision": {
                "should_stop": bool(stop_decision.get("should_stop")),
                "ready_to_commit": bool(stop_decision.get("ready_to_commit")),
                "stop_confidence": float(stop_decision.get("stop_confidence") or 0.0),
                "reasoning": str(stop_decision.get("reasoning") or ""),
            },
            "focus": director_plan.get("focus"),
            "assistant_message": str(reply.get("assistant_message") or "").strip(),
            "message_type": str(reply.get("message_type") or "question"),
            "surfaced_insights": reply.get("surfaced_insights") or [],
        }

    assistant_message = str(fast_result.get("assistant_message") or "").strip()
    if not assistant_message:
        assistant_message = "Tell me more about that."

    message_type = str(fast_result.get("message_type") or "question").strip() or "question"
    focus = fast_result.get("focus")
    if not isinstance(focus, str):
        focus = None
    working_narrative = str(fast_result.get("working_narrative") or session.get("working_narrative") or "").strip() or session.get("working_narrative")

    hidden_state_update = safe_hidden_state_payload(fast_result.get("hidden_state") or {})
    stop_decision = fast_result.get("stop_decision") if isinstance(fast_result.get("stop_decision"), dict) else {}

    # Persist only the visible narrative; Vapi manages hidden memory.
    session["working_narrative"] = working_narrative
    session["hidden_state"] = {}

    _append_turn(
        session=session,
        role="assistant",
        content=assistant_message,
        message_type=message_type,
    )
    ready_to_commit = bool(stop_decision.get("ready_to_commit"))
    session["stop_confidence"] = float(stop_decision.get("stop_confidence") or 0.0)
    session["current_focus"] = focus
    session["status"] = _session_status_for(
        turn_count=int(session.get("turn_count") or 0),
        stop_ready=ready_to_commit,
        committed=False,
    )

    surfaced_insights = _derive_surfaced_insights(
        {},
        explicit=fast_result.get("surfaced_insights") or [],
    )

    return {
        "session_id": session["id"],
        "assistant_message": assistant_message,
        "working_narrative": session.get("working_narrative"),
        "surfaced_insights": surfaced_insights,
        "should_continue": session["status"] not in {"ready_to_commit", "committed"},
        "session_status": session["status"],
        "ready_to_commit": ready_to_commit,
    }


async def get_builder_session_state(
    db: AsyncSession,
    *,
    person_id: str,
    session_id: str,
) -> dict[str, Any]:
    session = _builder_sessions.get(session_id)
    if session and session.get("person_id") != person_id:
        session = None
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Builder session not found")

    turns = _load_turns(session)
    visible_turns = [turn for turn in turns if turn["role"] in {"user", "assistant"}]
    hidden_state = _hidden_state_to_dict(session.get("hidden_state"))

    return {
        "session_id": session["id"],
        "mode": session["mode"],
        "session_status": session["status"],
        "current_focus": session.get("current_focus"),
        "working_narrative": session.get("working_narrative"),
        "turn_count": int(session.get("turn_count") or 0),
        "stop_confidence": float(session.get("stop_confidence") or 0.0),
        "ready_to_commit": session["status"] in {"ready_to_commit", "committed"},
        "should_continue": session["status"] not in {"ready_to_commit", "committed", "archived"},
        "surfaced_insights": _derive_surfaced_insights(hidden_state),
        "turns": [
            {
                "id": turn["id"],
                "role": turn["role"],
                "content": turn["content"],
                "turn_index": turn["turn_index"],
                "message_type": turn["message_type"],
                "created_at": turn.get("created_at"),
            }
            for turn in visible_turns
        ],
    }


__all__ = [
    "commit_builder_session",
    "commit_builder_transcript",
    "extract_schema",
    "get_extract_schema_job",
    "get_builder_session_state",
    "process_builder_turn",
    "schedule_extract_schema",
]
