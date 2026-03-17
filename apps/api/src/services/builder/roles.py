"""Hidden role helpers for the conversation-first Builder engine."""

from __future__ import annotations

import json
import logging
from typing import Any

from src.prompts.builder_conversation import (
    build_commit_synthesis_prompt,
    build_conversation_director_prompt,
    build_narrative_updater_prompt,
    build_question_composer_prompt,
    build_stop_evaluator_prompt,
    build_talent_spotter_prompt,
)
from src.providers import ChatServiceError, get_chat_provider
from src.utils import extract_json_from_llm_response

logger = logging.getLogger(__name__)


def _parse_json_response(text: str) -> dict[str, Any]:
    raw = extract_json_from_llm_response(text or "")
    data = json.loads(raw)
    return data if isinstance(data, dict) else {}


async def _chat_json(prompt: str, *, max_tokens: int, temperature: float = 0.2) -> dict[str, Any]:
    chat = get_chat_provider()
    response = await chat.chat(prompt, max_tokens=max_tokens, temperature=temperature)
    return _parse_json_response(response)


def _coerce_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _coerce_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _coerce_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return default


def _coerce_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes"}
    return default


async def update_working_narrative(
    *,
    working_narrative: str,
    visible_turns: list[dict[str, Any]],
    hidden_state: dict[str, Any],
) -> dict[str, Any]:
    prompt = build_narrative_updater_prompt(
        working_narrative=working_narrative,
        visible_turns=visible_turns,
        hidden_state=hidden_state,
    )
    data = await _chat_json(prompt, max_tokens=900, temperature=0.15)
    narrative = str(data.get("working_narrative") or "").strip() or working_narrative
    return {
        "working_narrative": narrative,
        "known": _coerce_list(data.get("known")),
        "distinctive": _coerce_list(data.get("distinctive")),
        "uncertain": _coerce_list(data.get("uncertain")),
    }


async def spot_talent(
    *,
    working_narrative: str,
    visible_turns: list[dict[str, Any]],
    hidden_state: dict[str, Any],
) -> dict[str, Any]:
    prompt = build_talent_spotter_prompt(
        working_narrative=working_narrative,
        visible_turns=visible_turns,
        hidden_state=hidden_state,
    )
    data = await _chat_json(prompt, max_tokens=1400, temperature=0.2)
    confidence = _coerce_dict(data.get("confidence"))
    return {
        "candidate_facts": _coerce_list(data.get("candidate_facts")),
        "evidence_spans": _coerce_list(data.get("evidence_spans")),
        "hidden_strengths": _coerce_list(data.get("hidden_strengths")),
        "opportunity_hypotheses": _coerce_list(data.get("opportunity_hypotheses")),
        "missing_high_value_signals": _coerce_list(data.get("missing_high_value_signals")),
        "possible_experience_boundaries": _coerce_list(data.get("possible_experience_boundaries")),
        "schema_patch": _coerce_dict(data.get("schema_patch")),
        "confidence": {
            "overall": _coerce_float(confidence.get("overall")),
            "narrative_stability": _coerce_float(confidence.get("narrative_stability")),
            "experience_clarity": _coerce_float(confidence.get("experience_clarity")),
        },
    }


async def evaluate_stop(
    *,
    working_narrative: str,
    visible_turns: list[dict[str, Any]],
    hidden_state: dict[str, Any],
    turn_count: int,
) -> dict[str, Any]:
    prompt = build_stop_evaluator_prompt(
        working_narrative=working_narrative,
        visible_turns=visible_turns,
        hidden_state=hidden_state,
        turn_count=turn_count,
    )
    data = await _chat_json(prompt, max_tokens=500, temperature=0.1)
    should_stop = _coerce_bool(data.get("should_stop"))
    stop_confidence = _coerce_float(data.get("stop_confidence"))
    ready_to_commit = _coerce_bool(data.get("ready_to_commit"), default=should_stop)
    reasoning = str(data.get("reasoning") or "").strip()
    return {
        "should_stop": should_stop,
        "stop_confidence": stop_confidence,
        "ready_to_commit": ready_to_commit,
        "reasoning": reasoning,
    }


async def direct_conversation(
    *,
    working_narrative: str,
    hidden_state: dict[str, Any],
    stop_decision: dict[str, Any],
    turn_count: int,
) -> dict[str, Any]:
    prompt = build_conversation_director_prompt(
        working_narrative=working_narrative,
        hidden_state=hidden_state,
        stop_decision=stop_decision,
        turn_count=turn_count,
    )
    data = await _chat_json(prompt, max_tokens=500, temperature=0.2)
    next_move = str(data.get("next_move") or "ask_high_value_question").strip()
    if next_move not in {
        "reflect_pattern",
        "ask_high_value_question",
        "test_hypothesis",
        "summarize_progress",
        "surface_strength",
        "stop_conversation",
        "prepare_commit",
    }:
        next_move = "ask_high_value_question"
    return {
        "next_move": next_move,
        "reasoning": str(data.get("reasoning") or "").strip(),
        "focus": str(data.get("focus") or "").strip() or None,
        "question_goal": str(data.get("question_goal") or "").strip() or None,
        "surface_strength": str(data.get("surface_strength") or "").strip() or None,
    }


async def compose_reply(
    *,
    working_narrative: str,
    hidden_state: dict[str, Any],
    director_plan: dict[str, Any],
    stop_decision: dict[str, Any],
    visible_turns: list[dict[str, Any]],
) -> dict[str, Any]:
    prompt = build_question_composer_prompt(
        working_narrative=working_narrative,
        hidden_state=hidden_state,
        director_plan=director_plan,
        stop_decision=stop_decision,
        visible_turns=visible_turns,
    )
    data = await _chat_json(prompt, max_tokens=700, temperature=0.35)
    message = str(data.get("assistant_message") or "").strip()
    message_type = str(data.get("message_type") or "").strip() or "question"
    surfaced_insights = [
        str(item).strip()
        for item in _coerce_list(data.get("surfaced_insights"))
        if str(item).strip()
    ]
    return {
        "assistant_message": message,
        "message_type": message_type,
        "surfaced_insights": surfaced_insights,
    }


async def synthesize_commit_input(
    *,
    working_narrative: str,
    hidden_state: dict[str, Any],
    visible_turns: list[dict[str, Any]],
) -> str:
    prompt = build_commit_synthesis_prompt(
        working_narrative=working_narrative,
        hidden_state=hidden_state,
        visible_turns=visible_turns,
    )
    data = await _chat_json(prompt, max_tokens=1200, temperature=0.15)
    return str(data.get("extraction_input") or "").strip()


def fallback_stop_decision(*, hidden_state: dict[str, Any], turn_count: int) -> dict[str, Any]:
    missing_signals = hidden_state.get("missing_high_value_signals")
    missing_count = len(missing_signals) if isinstance(missing_signals, list) else 0
    strengths = hidden_state.get("hidden_strengths")
    strengths_count = len(strengths) if isinstance(strengths, list) else 0
    should_stop = turn_count >= 6 and missing_count == 0 and strengths_count > 0
    return {
        "should_stop": should_stop,
        "stop_confidence": 0.75 if should_stop else 0.35,
        "ready_to_commit": should_stop,
        "reasoning": "Fallback heuristic based on turn count, surfaced strengths, and missing signals.",
    }


def fallback_director(*, stop_decision: dict[str, Any], hidden_state: dict[str, Any]) -> dict[str, Any]:
    strengths = hidden_state.get("hidden_strengths")
    first_strength = None
    if isinstance(strengths, list):
        for item in strengths:
            if isinstance(item, dict) and item.get("strength"):
                first_strength = str(item.get("strength")).strip()
                break
    if stop_decision.get("should_stop"):
        return {
            "next_move": "stop_conversation",
            "reasoning": "Stop evaluator indicates low expected value from another question.",
            "focus": None,
            "question_goal": None,
            "surface_strength": first_strength,
        }
    return {
        "next_move": "ask_high_value_question",
        "reasoning": "Keep deepening one meaningful area.",
        "focus": None,
        "question_goal": "Understand where the person's value was most distinctive.",
        "surface_strength": first_strength,
    }


def fallback_reply(*, director_plan: dict[str, Any], stop_decision: dict[str, Any], hidden_state: dict[str, Any]) -> dict[str, Any]:
    strengths = hidden_state.get("hidden_strengths")
    surfaced_insights: list[str] = []
    top_strength = None
    if isinstance(strengths, list):
        for item in strengths:
            if isinstance(item, dict) and item.get("strength"):
                top_strength = str(item.get("strength")).strip()
                if top_strength:
                    surfaced_insights.append(top_strength)
                    break
    if stop_decision.get("should_stop"):
        message = "I think I have a pretty strong picture of what stands out about you now, so I’m going to stop here before this turns repetitive."
        if top_strength:
            message += f" One thing that comes through clearly is your knack for {top_strength.lower()}."
        return {
            "assistant_message": message,
            "message_type": "stop",
            "surfaced_insights": surfaced_insights,
        }
    if top_strength:
        return {
            "assistant_message": f"One thing that keeps coming through is your strength in {top_strength.lower()}. What was the part of that work that people seemed to rely on you for most?",
            "message_type": "question",
            "surfaced_insights": surfaced_insights,
        }
    return {
        "assistant_message": "What part of that do you think revealed something distinctive about how you work?",
        "message_type": "question",
        "surfaced_insights": surfaced_insights,
    }


def safe_hidden_state_payload(hidden_state: dict[str, Any]) -> dict[str, Any]:
    return {
        "candidate_facts": _coerce_list(hidden_state.get("candidate_facts")),
        "evidence_spans": _coerce_list(hidden_state.get("evidence_spans")),
        "hidden_strengths": _coerce_list(hidden_state.get("hidden_strengths")),
        "opportunity_hypotheses": _coerce_list(hidden_state.get("opportunity_hypotheses")),
        "missing_high_value_signals": _coerce_list(hidden_state.get("missing_high_value_signals")),
        "possible_experience_boundaries": _coerce_list(hidden_state.get("possible_experience_boundaries")),
        "schema_patch": _coerce_dict(hidden_state.get("schema_patch")),
        "confidence": _coerce_dict(hidden_state.get("confidence")),
    }


__all__ = [
    "ChatServiceError",
    "compose_reply",
    "direct_conversation",
    "evaluate_stop",
    "fallback_director",
    "fallback_reply",
    "fallback_stop_decision",
    "safe_hidden_state_payload",
    "spot_talent",
    "synthesize_commit_input",
    "update_working_narrative",
]
