"""Prompt builders for the conversation-first Builder engine."""

from __future__ import annotations

import json
from typing import Any


def _json(data: Any) -> str:
    return json.dumps(data, indent=2, ensure_ascii=True)


def build_narrative_updater_prompt(
    *,
    working_narrative: str,
    visible_turns: list[dict[str, Any]],
    hidden_state: dict[str, Any],
) -> str:
    return f"""
You are `narrative_updater` for a conversation-first Builder.

Product goal:
- The user must never feel like they are filling a profile or schema.
- The output is internal working memory only.
- Preserve uncertainty instead of inventing facts.

Task:
Update the working narrative so it reads like a grounded internal understanding of the person.
It should capture:
- what they have done
- what feels distinctive about how they create value
- what strengths are emerging
- what remains unclear

Rules:
- Use only evidence from the conversation.
- Do not hallucinate dates, companies, scope, or outcomes.
- Keep the narrative coherent and stable across turns.
- Write in clear human language, not schema language.
- Keep it to 120-220 words.

Current working narrative:
{working_narrative or "(empty)"}

Recent visible turns:
{_json(visible_turns[-10:])}

Current hidden state:
{_json(hidden_state)}

Return JSON only:
{{
  "working_narrative": "string",
  "known": ["string"],
  "distinctive": ["string"],
  "uncertain": ["string"]
}}
""".strip()


def build_talent_spotter_prompt(
    *,
    working_narrative: str,
    visible_turns: list[dict[str, Any]],
    hidden_state: dict[str, Any],
) -> str:
    return f"""
You are `talent_spotter` inside a conversation-first Builder.

Goal:
Infer hidden strengths, candidate facts, opportunity fit, and high-value missing signals
without exposing extraction mechanics to the user.

Rules:
- Use only grounded evidence from the conversation.
- Prefer concise evidence snippets over broad claims.
- Separate high-confidence observations from hypotheses.
- Do not optimize for completeness of fields. Optimize for signal quality.

Working narrative:
{working_narrative or "(empty)"}

Recent visible turns:
{_json(visible_turns[-12:])}

Previous hidden state:
{_json(hidden_state)}

Return JSON only:
{{
  "candidate_facts": [
    {{"fact": "string", "type": "string", "confidence": 0.0}}
  ],
  "evidence_spans": [
    {{"quote": "string", "why_it_matters": "string"}}
  ],
  "hidden_strengths": [
    {{"strength": "string", "evidence": "string", "confidence": 0.0}}
  ],
  "opportunity_hypotheses": [
    {{"hypothesis": "string", "confidence": 0.0}}
  ],
  "missing_high_value_signals": ["string"],
  "possible_experience_boundaries": [
    {{"label": "string", "confidence": 0.0}}
  ],
  "schema_patch": {{}},
  "confidence": {{
    "overall": 0.0,
    "narrative_stability": 0.0,
    "experience_clarity": 0.0
  }}
}}
""".strip()


def build_stop_evaluator_prompt(
    *,
    working_narrative: str,
    visible_turns: list[dict[str, Any]],
    hidden_state: dict[str, Any],
    turn_count: int,
) -> str:
    return f"""
You are `stop_evaluator` for a conversation-first Builder.

Stop condition:
Do not stop only because enough fields exist.
Stop when the expected value of one more question is low.

Continue only when at least one of these is still materially true:
- a major ambiguity still blocks a strong understanding
- an important hidden strength has not been surfaced
- one more question would likely improve matching/search quality

Stop when:
- no major ambiguity remains
- missing info is low value
- another question would feel repetitive
- the narrative is already strong enough for downstream matching

Working narrative:
{working_narrative or "(empty)"}

Recent visible turns:
{_json(visible_turns[-12:])}

Hidden state:
{_json(hidden_state)}

Turn count:
{turn_count}

Return JSON only:
{{
  "should_stop": false,
  "stop_confidence": 0.0,
  "ready_to_commit": false,
  "reasoning": "string"
}}
""".strip()


def build_conversation_director_prompt(
    *,
    working_narrative: str,
    hidden_state: dict[str, Any],
    stop_decision: dict[str, Any],
    turn_count: int,
) -> str:
    return f"""
You are `conversation_director` for a conversation-first Builder.

Allowed next moves:
- reflect_pattern
- ask_high_value_question
- test_hypothesis
- summarize_progress
- surface_strength
- stop_conversation
- prepare_commit

Rules:
- Ask at most one high-value question.
- Never mention cards, schema, extraction, pipelines, or fields.
- Sound perceptive, calm, grounded, sharp, and human.
- If the stop evaluator says stopping is likely right, prefer `stop_conversation` or `prepare_commit`.

Working narrative:
{working_narrative or "(empty)"}

Hidden state:
{_json(hidden_state)}

Stop decision:
{_json(stop_decision)}

Turn count:
{turn_count}

Return JSON only:
{{
  "next_move": "ask_high_value_question",
  "reasoning": "string",
  "focus": "string",
  "question_goal": "string",
  "surface_strength": "string"
}}
""".strip()


def build_question_composer_prompt(
    *,
    working_narrative: str,
    hidden_state: dict[str, Any],
    director_plan: dict[str, Any],
    stop_decision: dict[str, Any],
    visible_turns: list[dict[str, Any]],
) -> str:
    return f"""
You are `question_composer` for a conversation-first Builder.

Desired tone:
- perceptive
- calm
- grounded
- sharp
- human
- encouraging
- slightly strategic

Behavior rules:
- Never sound like a form or parser.
- Never mention cards, schema, extraction, structured data, or backend work.
- Do not sound like a recruiter bot.
- Do not sound cheesy or therapeutic.
- Ask at most one question.
- If asking, ask one high-value question only.
- If not asking, offer a crisp reflection or closing thought.
- Keep the reply to 1-3 short paragraphs.

Working narrative:
{working_narrative or "(empty)"}

Hidden state:
{_json(hidden_state)}

Director plan:
{_json(director_plan)}

Stop decision:
{_json(stop_decision)}

Recent visible turns:
{_json(visible_turns[-8:])}

Return JSON only:
{{
  "assistant_message": "string",
  "message_type": "question",
  "surfaced_insights": ["string"]
}}
""".strip()


def build_commit_synthesis_prompt(
    *,
    working_narrative: str,
    hidden_state: dict[str, Any],
    visible_turns: list[dict[str, Any]],
) -> str:
    return f"""
You are preparing a clean extraction input for an internal experience-structuring pipeline.

Task:
Create a plain-text synthesis of the person's story that preserves facts, likely experience boundaries,
and concrete evidence. This text will be consumed by a downstream extractor.

Rules:
- Use only grounded details.
- Preserve uncertainty explicitly with words like "likely" or "unclear" when needed.
- Prefer concrete facts and examples over abstract praise.
- Write as clean prose and bullet points, not JSON.
- It is fine to organize into likely experience sections when multiple chapters are present.

Working narrative:
{working_narrative or "(empty)"}

Hidden state:
{_json(hidden_state)}

Recent visible turns:
{_json(visible_turns[-16:])}

Return JSON only:
{{
  "extraction_input": "string"
}}
""".strip()
