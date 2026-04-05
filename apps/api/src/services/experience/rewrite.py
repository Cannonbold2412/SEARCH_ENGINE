"""Rewrite helpers for the experience pipeline."""

from __future__ import annotations

import asyncio
import hashlib
import logging

from fastapi import HTTPException, status

from src.prompts.experience_card import PROMPT_REWRITE, fill_prompt
from src.providers import ChatServiceError, get_chat_provider

from .errors import PipelineError, PipelineStage

logger = logging.getLogger(__name__)

_LLM_TOKENS_REWRITE = 2048
_REWRITE_CACHE: dict[str, str] = {}
_REWRITE_CACHE_MAX = 256
_rewrite_cache_lock = asyncio.Lock()


def _rewrite_cache_key(text: str) -> str:
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()


async def _rewrite_cache_get(text: str) -> str | None:
    key = _rewrite_cache_key(text)
    async with _rewrite_cache_lock:
        return _REWRITE_CACHE.get(key)


async def _rewrite_cache_set(text: str, cleaned: str) -> None:
    key = _rewrite_cache_key(text)
    async with _rewrite_cache_lock:
        if len(_REWRITE_CACHE) >= _REWRITE_CACHE_MAX:
            oldest = next(iter(_REWRITE_CACHE))
            del _REWRITE_CACHE[oldest]
        _REWRITE_CACHE[key] = cleaned


async def rewrite_raw_text(raw_text: str) -> str:
    """
    Clean and rewrite raw input text. Cached in-process by SHA-256 of input so
    repeated calls on the same text hit the LLM once.
    """
    if not raw_text or not raw_text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="raw_text is required and cannot be empty",
        )

    cached = await _rewrite_cache_get(raw_text)
    if cached:
        logger.debug("rewrite_raw_text: cache hit")
        return cached

    try:
        chat = get_chat_provider()
        prompt = fill_prompt(PROMPT_REWRITE, user_text=raw_text)
        rewritten = await chat.chat(prompt, max_tokens=_LLM_TOKENS_REWRITE)
        cleaned = " ".join((rewritten or "").split()).strip()
        if not cleaned:
            raise PipelineError(PipelineStage.REWRITE, "Rewrite returned empty text")
        await _rewrite_cache_set(raw_text, cleaned)
        return cleaned
    except ChatServiceError as e:
        raise PipelineError(
            PipelineStage.REWRITE,
            f"Chat service failed: {str(e)}",
            cause=e,
        ) from e
