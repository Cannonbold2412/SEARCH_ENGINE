"""Conversation-first Builder orchestration engine."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.session import async_session
from src.services.builder.roles import (
    ChatServiceError,
    fallback_director,
    fallback_reply,
    fallback_stop_decision,
    fast_turn,
    safe_hidden_state_payload,
    synthesize_commit_input,
)

from .builder_extraction import (
    _commit_extraction_input,
    _debug_log,
    _fetch_vapi_transcript_by_call_id,
    _normalize_adjacent_duplicate_phrases,
)
from .builder_session import (
    _append_turn,
    _derive_surfaced_insights,
    _hidden_state_to_dict,
    _load_session_with_state,
    _load_turns,
    _mark_extract_schema_job_completed,
    _mark_extract_schema_job_failed,
    _mark_extract_schema_job_running,
    _resolve_session,
    _session_status_for,
    _visible_turns_to_payload,
    get_extract_schema_job,
)

logger = logging.getLogger(__name__)


async def commit_builder_session(
    db: AsyncSession,
    *,
    person_id: str,
    session_id: str,
) -> dict[str, Any]:
    session = await _resolve_session(
        person_id=person_id,
        session_id=session_id,
        allow_committed_session=True,
    )
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Builder session not found"
        )

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


async def commit_builder_transcript(
    db: AsyncSession,
    *,
    person_id: str,
    call_id: str | None = None,
    transcript: str | None = None,
    session_id: str | None = None,
    mode: str = "voice",
    language: str = "en",
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

    # Translate non-English transcript to English before extraction
    if extraction_input and language.lower() not in ("en", "english"):
        from src.services.translation import to_english

        extraction_input = await to_english(extraction_input, language, db)
        _debug_log(
            "H3-H5",
            "engine.py:commit_builder_transcript:translated",
            "translated extraction input to English",
            {"sourceLanguage": language, "translatedLength": len(extraction_input or "")},
        )

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
    job = get_extract_schema_job(session_id) or {}
    if job.get("status") == "running":
        return False
    asyncio.create_task(_run_extract_schema_job(person_id=person_id, session_id=session_id))
    return True


async def _run_extract_schema_job(*, person_id: str, session_id: str) -> None:
    if not await _mark_extract_schema_job_running(session_id):
        return

    try:
        async with async_session() as db:
            try:
                result = await extract_schema(db, person_id=person_id, session_id=session_id)
                await db.commit()
            except Exception as exc:
                await db.rollback()
                logger.exception(
                    "background extract_schema failed for session=%s: %s", session_id, exc
                )
                await _mark_extract_schema_job_failed(session_id, str(exc))
                return
    except Exception as exc:
        logger.exception(
            "background extract_schema setup failed for session=%s: %s", session_id, exc
        )
        await _mark_extract_schema_job_failed(session_id, str(exc))
        return

    await _mark_extract_schema_job_completed(
        session_id,
        committed_card_count=int(result.get("committed_card_count") or 0),
        session_status=result.get("session_status") or "committed",
    )


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
        stop_decision = fallback_stop_decision(
            hidden_state=hidden_state, turn_count=int(session.get("turn_count") or 0)
        )
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
    working_narrative = str(
        fast_result.get("working_narrative") or session.get("working_narrative") or ""
    ).strip() or session.get("working_narrative")

    stop_decision_raw = fast_result.get("stop_decision")
    stop_decision = stop_decision_raw if isinstance(stop_decision_raw, dict) else {}

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
    session = await _resolve_session(
        person_id=person_id,
        session_id=session_id,
        allow_committed_session=True,
    )
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Builder session not found"
        )

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
