"""Conversation-first Builder orchestration engine."""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import (
    BuilderHiddenState,
    BuilderSession,
    BuilderTurn,
    ExperienceCard,
    ExperienceCardChild,
)
from src.serializers import experience_card_to_response, experience_card_child_to_response
from src.services.builder.roles import (
    ChatServiceError,
    compose_reply,
    direct_conversation,
    evaluate_stop,
    fallback_director,
    fallback_reply,
    fallback_stop_decision,
    safe_hidden_state_payload,
    spot_talent,
    synthesize_commit_input,
    update_working_narrative,
)
from src.services.experience import (
    detect_experiences,
    embed_experience_cards,
    experience_card_service,
    run_draft_single,
)

logger = logging.getLogger(__name__)

def _hidden_state_to_dict(state: BuilderHiddenState | None) -> dict[str, Any]:
    if state is None:
        return {
            "candidate_facts": [],
            "evidence_spans": [],
            "hidden_strengths": [],
            "opportunity_hypotheses": [],
            "missing_high_value_signals": [],
            "possible_experience_boundaries": [],
            "schema_patch": {},
            "confidence": {},
        }
    return {
        "candidate_facts": state.candidate_facts_json or [],
        "evidence_spans": state.evidence_spans_json or [],
        "hidden_strengths": state.hidden_strengths_json or [],
        "opportunity_hypotheses": state.opportunity_hypotheses_json or [],
        "missing_high_value_signals": state.missing_high_value_signals_json or [],
        "possible_experience_boundaries": state.possible_experience_boundaries_json or [],
        "schema_patch": state.schema_patch_json or {},
        "confidence": state.confidence_json or {},
    }


def _session_status_for(*, turn_count: int, stop_ready: bool, committed: bool) -> str:
    if committed:
        return "committed"
    if stop_ready:
        return "ready_to_commit"
    if turn_count >= 4:
        return "deepening"
    return "discovering"


def _visible_turns_to_payload(turns: list[BuilderTurn]) -> list[dict[str, Any]]:
    return [
        {
            "id": turn.id,
            "role": turn.role,
            "content": turn.content,
            "turn_index": turn.turn_index,
            "message_type": turn.message_type,
            "created_at": turn.created_at,
        }
        for turn in turns
        if turn.role in {"user", "assistant"}
    ]


def _derive_surfaced_insights(hidden_state: dict[str, Any], explicit: list[str] | None = None) -> list[str]:
    insights = [item.strip() for item in (explicit or []) if isinstance(item, str) and item.strip()]
    if insights:
        return insights[:3]
    derived: list[str] = []
    strengths = hidden_state.get("hidden_strengths")
    if isinstance(strengths, list):
        for item in strengths:
            if not isinstance(item, dict):
                continue
            strength = str(item.get("strength") or "").strip()
            if strength and strength not in derived:
                derived.append(strength)
            if len(derived) >= 3:
                break
    return derived


async def _next_turn_index(db: AsyncSession, session_id: str) -> int:
    result = await db.execute(
        select(func.max(BuilderTurn.turn_index)).where(BuilderTurn.session_id == session_id)
    )
    current = result.scalar_one_or_none() or 0
    return int(current) + 1


async def _append_turn(
    db: AsyncSession,
    *,
    session: BuilderSession,
    role: str,
    content: str,
    message_type: str,
    count_toward_session: bool = True,
) -> BuilderTurn:
    turn = BuilderTurn(
        session_id=session.id,
        role=role,
        content=content,
        message_type=message_type,
        turn_index=await _next_turn_index(db, session.id),
    )
    db.add(turn)
    if count_toward_session:
        session.turn_count = (session.turn_count or 0) + 1
    await db.flush()
    await db.refresh(turn)
    return turn


async def _load_turns(db: AsyncSession, session_id: str) -> list[BuilderTurn]:
    result = await db.execute(
        select(BuilderTurn)
        .where(BuilderTurn.session_id == session_id)
        .order_by(BuilderTurn.turn_index.asc())
    )
    return list(result.scalars().all())


async def _load_session_with_state(
    db: AsyncSession,
    *,
    person_id: str,
    session_id: str | None,
    mode: str,
) -> tuple[BuilderSession, BuilderHiddenState]:
    session: BuilderSession | None = None
    state: BuilderHiddenState | None = None

    if session_id:
        result = await db.execute(
            select(BuilderSession).where(
                BuilderSession.id == session_id,
                BuilderSession.person_id == person_id,
            )
        )
        session = result.scalar_one_or_none()
        if session and session.status in {"committed", "archived"}:
            session = None

    if session is None:
        session = BuilderSession(
            person_id=person_id,
            mode=mode if mode in {"text", "voice"} else "text",
            status="discovering",
            current_focus=None,
            working_narrative=None,
            turn_count=0,
            stop_confidence=0.0,
        )
        db.add(session)
        await db.flush()
        state = BuilderHiddenState(session_id=session.id)
        db.add(state)
        await db.flush()
        await db.refresh(session)
        await db.refresh(state)
        return session, state

    session.mode = mode if mode in {"text", "voice"} else session.mode
    state_result = await db.execute(
        select(BuilderHiddenState).where(BuilderHiddenState.session_id == session.id)
    )
    state = state_result.scalar_one_or_none()
    if state is None:
        state = BuilderHiddenState(session_id=session.id)
        db.add(state)
        await db.flush()
        await db.refresh(state)
    return session, state


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
    session_result = await db.execute(
        select(BuilderSession).where(
            BuilderSession.id == session_id,
            BuilderSession.person_id == person_id,
        )
    )
    session = session_result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Builder session not found")

    state_result = await db.execute(
        select(BuilderHiddenState).where(BuilderHiddenState.session_id == session.id)
    )
    hidden_state_model = state_result.scalar_one_or_none()
    hidden_state = _hidden_state_to_dict(hidden_state_model)
    turns = await _load_turns(db, session.id)
    visible_turns = _visible_turns_to_payload(turns)

    extraction_input = ""
    try:
        extraction_input = await synthesize_commit_input(
            working_narrative=session.working_narrative or "",
            hidden_state=hidden_state,
            visible_turns=visible_turns,
        )
    except (ChatServiceError, ValueError, json.JSONDecodeError) as exc:
        logger.warning("builder commit synthesis failed for session=%s: %s", session.id, exc)

    if not extraction_input:
        user_lines = [
            str(turn.get("content") or "").strip()
            for turn in visible_turns
            if turn.get("role") == "user"
        ]
        extraction_input = "\n\n".join(
            [session.working_narrative or ""] + [line for line in user_lines if line]
        ).strip()

    if not extraction_input:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Builder session does not have enough material to commit yet.",
        )

    try:
        detect_result = await detect_experiences(extraction_input)
    except Exception as exc:
        logger.warning("builder commit detect failed for session=%s: %s", session.id, exc)
        detect_result = {"count": 0, "experiences": []}

    experience_count = int(detect_result.get("count") or 0)
    if experience_count <= 0:
        experience_count = 1

    committed_cards: list[ExperienceCard] = []
    committed_children: list[ExperienceCardChild] = []
    # TODO(builder): dedupe repeated projections once sessions store explicit card lineage.
    for experience_index in range(1, experience_count + 1):
        _, _, families = await run_draft_single(
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

    session.status = "committed"
    session.stop_confidence = max(session.stop_confidence or 0.0, 0.8)
    await db.flush()

    return {
        "session_id": session.id,
        "session_status": session.status,
        "working_narrative": session.working_narrative,
        "committed_card_ids": [card.id for card in committed_cards],
        "committed_card_count": len(committed_cards),
        "cards": [experience_card_to_response(card) for card in committed_cards],
        "children": [experience_card_child_to_response(child) for child in committed_children],
    }


async def process_builder_turn(
    db: AsyncSession,
    *,
    person_id: str,
    message: str,
    session_id: str | None = None,
    mode: str = "text",
) -> dict[str, Any]:
    content = (message or "").strip()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="message is required")

    session, hidden_state_model = await _load_session_with_state(
        db,
        person_id=person_id,
        session_id=session_id,
        mode=mode,
    )

    await _append_turn(
        db,
        session=session,
        role="user",
        content=content,
        message_type="story",
    )

    turns = await _load_turns(db, session.id)
    visible_turns = _visible_turns_to_payload(turns)
    hidden_state = _hidden_state_to_dict(hidden_state_model)

    narrative_result: dict[str, Any] = {"working_narrative": session.working_narrative or ""}
    talent_result: dict[str, Any] | None = None

    try:
        narrative_result = await update_working_narrative(
            working_narrative=session.working_narrative or "",
            visible_turns=visible_turns,
            hidden_state=hidden_state,
        )
    except Exception as exc:
        logger.warning("builder narrative updater fallback for session=%s: %s", session.id, exc)
        narrative_result = {"working_narrative": session.working_narrative or ""}

    try:
        talent_result = await spot_talent(
            working_narrative=narrative_result.get("working_narrative") or "",
            visible_turns=visible_turns,
            hidden_state=hidden_state,
        )
    except Exception as exc:
        logger.warning("builder talent spotter fallback for session=%s: %s", session.id, exc)
        talent_result = safe_hidden_state_payload(hidden_state)

    # The narrative update above intentionally happens before hidden-state refresh so the
    # narrative remains a human-readable bridge, not the only source of truth.
    session.working_narrative = str(narrative_result.get("working_narrative") or session.working_narrative or "").strip() or session.working_narrative

    hidden_state_model.candidate_facts_json = talent_result.get("candidate_facts") or []
    hidden_state_model.evidence_spans_json = talent_result.get("evidence_spans") or []
    hidden_state_model.hidden_strengths_json = talent_result.get("hidden_strengths") or []
    hidden_state_model.opportunity_hypotheses_json = talent_result.get("opportunity_hypotheses") or []
    hidden_state_model.missing_high_value_signals_json = talent_result.get("missing_high_value_signals") or []
    hidden_state_model.possible_experience_boundaries_json = talent_result.get("possible_experience_boundaries") or []
    hidden_state_model.schema_patch_json = talent_result.get("schema_patch") or {}
    hidden_state_model.confidence_json = talent_result.get("confidence") or {}

    stop_decision: dict[str, Any]
    try:
        stop_decision = await evaluate_stop(
            working_narrative=session.working_narrative or "",
            visible_turns=visible_turns,
            hidden_state=safe_hidden_state_payload(talent_result),
            turn_count=session.turn_count,
        )
    except Exception as exc:
        logger.warning("builder stop evaluator fallback for session=%s: %s", session.id, exc)
        stop_decision = fallback_stop_decision(
            hidden_state=safe_hidden_state_payload(talent_result),
            turn_count=session.turn_count,
        )

    try:
        director_plan = await direct_conversation(
            working_narrative=session.working_narrative or "",
            hidden_state=safe_hidden_state_payload(talent_result),
            stop_decision=stop_decision,
            turn_count=session.turn_count,
        )
    except Exception as exc:
        logger.warning("builder director fallback for session=%s: %s", session.id, exc)
        director_plan = fallback_director(
            stop_decision=stop_decision,
            hidden_state=safe_hidden_state_payload(talent_result),
        )

    try:
        reply = await compose_reply(
            working_narrative=session.working_narrative or "",
            hidden_state=safe_hidden_state_payload(talent_result),
            director_plan=director_plan,
            stop_decision=stop_decision,
            visible_turns=visible_turns,
        )
    except Exception as exc:
        logger.warning("builder reply fallback for session=%s: %s", session.id, exc)
        reply = fallback_reply(
            director_plan=director_plan,
            stop_decision=stop_decision,
            hidden_state=safe_hidden_state_payload(talent_result),
        )

    assistant_message = str(reply.get("assistant_message") or "").strip()
    if not assistant_message:
        assistant_message = fallback_reply(
            director_plan=director_plan,
            stop_decision=stop_decision,
            hidden_state=safe_hidden_state_payload(talent_result),
        )["assistant_message"]

    await _append_turn(
        db,
        session=session,
        role="assistant",
        content=assistant_message,
        message_type=str(reply.get("message_type") or "question"),
    )
    await _append_turn(
        db,
        session=session,
        role="system_hidden",
        content=json.dumps(
            {
                "director_plan": director_plan,
                "stop_decision": stop_decision,
            },
            ensure_ascii=True,
        ),
        message_type="summary",
        count_toward_session=False,
    )

    ready_to_commit = bool(stop_decision.get("ready_to_commit"))
    session.stop_confidence = float(stop_decision.get("stop_confidence") or 0.0)
    session.current_focus = director_plan.get("focus")
    session.status = _session_status_for(
        turn_count=session.turn_count,
        stop_ready=ready_to_commit,
        committed=False,
    )
    await db.flush()

    committed_payload: dict[str, Any] | None = None
    if ready_to_commit:
        try:
            committed_payload = await commit_builder_session(
                db,
                person_id=person_id,
                session_id=session.id,
            )
        except Exception as exc:
            logger.warning("builder auto-commit failed for session=%s: %s", session.id, exc)
            session.status = "ready_to_commit"
            committed_payload = None

    surfaced_insights = _derive_surfaced_insights(
        safe_hidden_state_payload(talent_result),
        explicit=reply.get("surfaced_insights"),
    )

    return {
        "session_id": session.id,
        "assistant_message": assistant_message,
        "working_narrative": session.working_narrative,
        "surfaced_insights": surfaced_insights,
        "should_continue": session.status not in {"ready_to_commit", "committed"},
        "session_status": committed_payload.get("session_status") if committed_payload else session.status,
        "ready_to_commit": ready_to_commit,
    }


async def get_builder_session_state(
    db: AsyncSession,
    *,
    person_id: str,
    session_id: str,
) -> dict[str, Any]:
    session_result = await db.execute(
        select(BuilderSession).where(
            BuilderSession.id == session_id,
            BuilderSession.person_id == person_id,
        )
    )
    session = session_result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Builder session not found")

    state_result = await db.execute(
        select(BuilderHiddenState).where(BuilderHiddenState.session_id == session.id)
    )
    hidden_state_model = state_result.scalar_one_or_none()
    turns = await _load_turns(db, session.id)
    visible_turns = [turn for turn in turns if turn.role in {"user", "assistant"}]
    hidden_state = _hidden_state_to_dict(hidden_state_model)

    return {
        "session_id": session.id,
        "mode": session.mode,
        "session_status": session.status,
        "current_focus": session.current_focus,
        "working_narrative": session.working_narrative,
        "turn_count": session.turn_count,
        "stop_confidence": session.stop_confidence or 0.0,
        "ready_to_commit": session.status in {"ready_to_commit", "committed"},
        "should_continue": session.status not in {"ready_to_commit", "committed", "archived"},
        "surfaced_insights": _derive_surfaced_insights(hidden_state),
        "turns": [
            {
                "id": turn.id,
                "role": turn.role,
                "content": turn.content,
                "turn_index": turn.turn_index,
                "message_type": turn.message_type,
                "created_at": turn.created_at,
            }
            for turn in visible_turns
        ],
    }


__all__ = [
    "commit_builder_session",
    "get_builder_session_state",
    "process_builder_turn",
]
