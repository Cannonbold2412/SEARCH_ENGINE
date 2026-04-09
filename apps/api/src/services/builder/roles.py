"""Hidden role helpers for the conversation-first Builder engine."""

from __future__ import annotations

import json
from typing import Any

from src.prompts.builder_conversation import (
    build_commit_synthesis_prompt,
    build_fast_turn_prompt,
)
from src.providers import ChatServiceError, get_chat_provider
from src.utils import extract_json_from_llm_response


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


async def fast_turn(
    *,
    working_narrative: str,
    hidden_state: dict[str, Any],
    visible_turns: list[dict[str, Any]],
    turn_count: int,
    mode: str = "text",
) -> dict[str, Any]:
    """Single-call replacement for the old 5-step Builder pipeline."""
    prompt = build_fast_turn_prompt(
        working_narrative=working_narrative,
        hidden_state=hidden_state,
        visible_turns=visible_turns,
        turn_count=turn_count,
        mode=mode,
    )
    temperature = 0.5 if (mode or "").strip().lower() == "voice" else 0.6
    data = await _chat_json(prompt, max_tokens=900, temperature=temperature)

    updated_working_narrative = (
        str(data.get("working_narrative") or "").strip() or working_narrative
    )

    raw_hidden_state = data.get("hidden_state")
    if raw_hidden_state and isinstance(raw_hidden_state, dict):
        normalized_hidden_state = raw_hidden_state
    else:
        normalized_hidden_state = {}

    raw_stop = data.get("stop_decision")
    if raw_stop and isinstance(raw_stop, dict):
        should_stop = _coerce_bool(raw_stop.get("should_stop"))
        ready_to_commit = _coerce_bool(raw_stop.get("ready_to_commit"), default=should_stop)
        stop_confidence = _coerce_float(raw_stop.get("stop_confidence"))
        reasoning = str(raw_stop.get("reasoning") or "").strip()
    else:
        should_stop = False
        ready_to_commit = False
        stop_confidence = 0.0
        reasoning = ""

    focus_val = data.get("focus")
    focus = str(focus_val).strip() if isinstance(focus_val, str) and focus_val.strip() else None

    assistant_message = str(data.get("assistant_message") or "").strip()
    message_type = str(data.get("message_type") or "question").strip() or "question"
    surfaced_insights = [
        str(item).strip()
        for item in _coerce_list(data.get("surfaced_insights"))
        if str(item).strip()
    ]

    return {
        "working_narrative": updated_working_narrative,
        "hidden_state": normalized_hidden_state,
        "stop_decision": {
            "should_stop": should_stop,
            "ready_to_commit": ready_to_commit,
            "stop_confidence": stop_confidence,
            "reasoning": reasoning,
        },
        "focus": focus,
        "assistant_message": assistant_message,
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


def fallback_director(
    *, stop_decision: dict[str, Any], hidden_state: dict[str, Any]
) -> dict[str, Any]:
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


def fallback_reply(
    *, director_plan: dict[str, Any], stop_decision: dict[str, Any], hidden_state: dict[str, Any]
) -> dict[str, Any]:
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
            message += (
                f" One thing that comes through clearly is your knack for {top_strength.lower()}."
            )
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
        "possible_experience_boundaries": _coerce_list(
            hidden_state.get("possible_experience_boundaries")
        ),
        "schema_patch": _coerce_dict(hidden_state.get("schema_patch")),
        "confidence": _coerce_dict(hidden_state.get("confidence")),
    }


__all__ = [
    "ChatServiceError",
    "fast_turn",
    "fallback_director",
    "fallback_reply",
    "fallback_stop_decision",
    "safe_hidden_state_payload",
    "synthesize_commit_input",
]
