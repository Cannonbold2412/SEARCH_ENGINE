"""Builder transcript and extraction helpers."""

from __future__ import annotations

import json
import logging
import os
import re
import uuid
from datetime import UTC, datetime
from typing import Any

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import get_settings
from src.db.models import ExperienceCard, ExperienceCardChild
from src.serializers import experience_card_child_to_response, experience_card_to_response
from src.services.experience import (
    detect_experiences,
    embed_experience_cards,
    experience_card_service,
    run_draft_single,
)

logger = logging.getLogger(__name__)


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
            "timestamp": int(datetime.now(UTC).timestamp() * 1000),
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
        message_lines: list[str] = []
        for key in ("text", "content", "value"):
            value = transcript.get(key)
            if isinstance(value, str) and value.strip():
                message_lines.append(value.strip())
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
                    message_lines.append(f"{role.title()}: {text}")
                else:
                    message_lines.append(text)
        if message_lines:
            return "\n".join(message_lines).strip()
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
        logger.warning(
            "vapi call fetch failed for call_id=%s status=%s", call_id, exc.response.status_code
        )
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
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="Invalid Vapi call response."
        )
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


async def _finalize_card(
    db: AsyncSession, *, person_id: str, card_id: str
) -> ExperienceCard | None:
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


__all__ = [
    "_commit_extraction_input",
    "_debug_log",
    "_extract_vapi_transcript",
    "_fetch_vapi_transcript_by_call_id",
    "_finalize_card",
    "_normalize_adjacent_duplicate_phrases",
]
