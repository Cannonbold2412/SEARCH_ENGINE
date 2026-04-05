"""Edit-form fill-missing helper for experience cards."""

from __future__ import annotations

import json
import logging

from fastapi import HTTPException, status

from src.prompts.experience_card import (
    FILL_MISSING_ITEMS_APPEND_INSTRUCTION,
    PROMPT_FILL_MISSING_FIELDS,
    fill_prompt,
)
from src.providers import ChatServiceError, get_chat_provider
from src.utils import extract_json_from_llm_response as _extract_json_from_text

from .field_extractors import parse_date_field
from .rewrite import rewrite_raw_text

logger = logging.getLogger(__name__)

_LLM_TOKENS_FILL_MISSING = 2048
FILL_MISSING_PARENT_KEYS = (
    "title, summary, normalized_role, domain, sub_domain, company_name, company_type, "
    "location, employment_type, start_date, end_date, is_current, intent_primary, "
    "intent_secondary_str, seniority_level, confidence_score"
)
FILL_MISSING_CHILD_KEYS = "raw_text, items"


async def fill_missing_fields_from_text(
    raw_text: str,
    current_card: dict,
    card_type: str,
    language: str = "en",
    db=None,
) -> dict:
    """Rewrite the source text and extract only the missing fields for the form."""
    if not raw_text or not raw_text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="raw_text is required and cannot be empty",
        )
    card_type = (card_type or "parent").strip().lower()
    if card_type not in ("parent", "child"):
        card_type = "parent"
    allowed_keys = FILL_MISSING_PARENT_KEYS if card_type == "parent" else FILL_MISSING_CHILD_KEYS

    # Translate non-English text to English before processing
    text_to_process = raw_text
    if language.lower() not in ("en", "english"):
        from src.services.translation import to_english

        text_to_process = await to_english(raw_text, language, db)
        logger.debug(
            "Translated fill-missing text from %s to English (%d -> %d chars)",
            language,
            len(raw_text),
            len(text_to_process),
        )

    cleaned_text = await rewrite_raw_text(text_to_process)
    items_instruction = (
        FILL_MISSING_ITEMS_APPEND_INSTRUCTION
        if (card_type == "child" and "items" in (allowed_keys or ""))
        else ""
    )
    prompt = fill_prompt(
        PROMPT_FILL_MISSING_FIELDS,
        cleaned_text=cleaned_text,
        current_card_json=json.dumps(current_card, indent=2),
        allowed_keys=allowed_keys,
        items_instruction=items_instruction,
    )
    chat = get_chat_provider()
    try:
        response = await chat.chat(prompt, max_tokens=_LLM_TOKENS_FILL_MISSING)
    except ChatServiceError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    if not response or not response.strip():
        return {}

    try:
        json_str = _extract_json_from_text(response)
        data = json.loads(json_str)
        if not isinstance(data, dict):
            return {}
        if "intent_secondary" in data and "intent_secondary_str" not in data:
            val = data.pop("intent_secondary")
            if isinstance(val, list):
                data["intent_secondary_str"] = ", ".join(str(x) for x in val)
            else:
                data["intent_secondary_str"] = str(val) if val is not None else ""
        for key in ("start_date", "end_date"):
            if key in data:
                parsed = parse_date_field(str(data[key])) if data[key] is not None else None
                if parsed:
                    data[key] = parsed.isoformat()
        return data
    except (ValueError, json.JSONDecodeError):
        logger.warning("fill_missing_fields: could not parse LLM response as JSON")
        return {}
