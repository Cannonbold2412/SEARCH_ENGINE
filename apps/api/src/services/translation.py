"""Translation service helper functions with caching."""

import hashlib
import logging
from datetime import UTC, datetime

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import TranslationCache
from src.providers.translation import (
    TranslationConfigError,
    TranslationServiceError,
    get_translation_provider,
)

logger = logging.getLogger(__name__)


def _text_hash(text: str) -> str:
    """Generate a SHA-256 hash of the text for cache lookup."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _looks_like_poisoned_identity_cache(
    source: str, translated: str, target_lang: str, *, min_len: int = 10
) -> bool:
    """
    True when cached/returned text equals English source for a non-English target.
    Long identical strings are almost always a failed translation stored as cache poison.
    """
    tnorm = target_lang.lower()
    if tnorm in ("en", "english"):
        return False
    s, t = source.strip(), translated.strip()
    if len(s) < min_len:
        return False
    return s == t


async def _delete_translation_cache_entry(
    db: AsyncSession, text: str, source_lang: str, target_lang: str
) -> None:
    text_h = _text_hash(text)
    await db.execute(
        delete(TranslationCache).where(
            TranslationCache.text_hash == text_h,
            TranslationCache.source_lang == source_lang.lower(),
            TranslationCache.target_lang == target_lang.lower(),
        )
    )


async def _get_cached_translation(
    db: AsyncSession, text: str, source_lang: str, target_lang: str
) -> str | None:
    """Look up a cached translation. Returns None if not found."""
    text_h = _text_hash(text)
    result = await db.execute(
        select(TranslationCache.translated_text).where(
            TranslationCache.text_hash == text_h,
            TranslationCache.source_lang == source_lang.lower(),
            TranslationCache.target_lang == target_lang.lower(),
        )
    )
    row = result.scalar_one_or_none()
    if row:
        # Update accessed_at for LRU tracking
        await db.execute(
            update(TranslationCache)
            .where(
                TranslationCache.text_hash == text_h,
                TranslationCache.source_lang == source_lang.lower(),
                TranslationCache.target_lang == target_lang.lower(),
            )
            .values(accessed_at=datetime.now(UTC))
        )
    return row


async def _cache_translation(
    db: AsyncSession,
    text: str,
    source_lang: str,
    target_lang: str,
    translated_text: str,
) -> None:
    """Store a translation in the cache."""
    text_h = _text_hash(text)
    cache_entry = TranslationCache(
        text_hash=text_h,
        source_lang=source_lang.lower(),
        target_lang=target_lang.lower(),
        source_text=text,
        translated_text=translated_text,
    )
    db.add(cache_entry)
    # Let session flush handle the insert; unique constraint handles duplicates


async def translate_with_cache(
    db: AsyncSession,
    text: str,
    source_lang: str,
    target_lang: str,
) -> str:
    """
    Translate text with caching support.

    If source_lang == target_lang or text is empty, returns text as-is.
    Checks cache first, then calls provider and caches result.
    """
    if not text or not text.strip():
        return text
    source_norm = source_lang.lower()
    target_norm = target_lang.lower()
    if source_norm == target_norm:
        return text

    # Check cache first
    cached = await _get_cached_translation(db, text, source_norm, target_norm)
    if cached:
        if _looks_like_poisoned_identity_cache(text, cached, target_norm):
            logger.info(
                "Dropping poisoned translation cache (identity for non-en target %s)",
                target_norm,
            )
            await _delete_translation_cache_entry(db, text, source_norm, target_norm)
            await db.flush()
        else:
            logger.debug("Translation cache hit: %s -> %s", source_norm, target_norm)
            return cached

    # Call provider
    try:
        provider = get_translation_provider()
        translated = await provider.translate(text, source_lang, target_lang)

        # Do not cache failed "translations" that are identical to English source
        if not _looks_like_poisoned_identity_cache(text, translated, target_norm):
            try:
                await _cache_translation(db, text, source_norm, target_norm, translated)
                await db.flush()
            except Exception as e:
                # Likely duplicate key; log and continue
                logger.debug("Translation cache insert skipped: %s", e)
        else:
            logger.warning(
                "Not caching translation: same as source for target %s (len=%s)",
                target_norm,
                len(text.strip()),
            )

        return translated
    except TranslationConfigError:
        # Provider not configured; return original text
        logger.warning("Translation provider not configured; returning original text")
        return text
    except TranslationServiceError as e:
        logger.error("Translation service error: %s", e)
        return text  # Fallback to original on error


async def to_english(text: str, source_lang: str, db: AsyncSession | None = None) -> str:
    """
    Translate text to English.

    If source_lang is already English or text is empty, returns text as-is.
    If db is provided, caching is enabled.
    """
    if not text or not text.strip():
        return text
    if source_lang.lower() in ("english", "en"):
        return text

    if db:
        return await translate_with_cache(db, text, source_lang, "en")

    # No caching (legacy path)
    try:
        provider = get_translation_provider()
        return await provider.translate(text, source_lang, "English")
    except (TranslationConfigError, TranslationServiceError):
        return text


async def from_english(text: str, target_lang: str, db: AsyncSession | None = None) -> str:
    """
    Translate text from English to target language.

    If target_lang is English or text is empty, returns text as-is.
    If db is provided, caching is enabled.
    """
    if not text or not text.strip():
        return text
    if target_lang.lower() in ("english", "en"):
        return text

    if db:
        return await translate_with_cache(db, text, "en", target_lang)

    # No caching (legacy path)
    try:
        provider = get_translation_provider()
        return await provider.translate(text, "English", target_lang)
    except (TranslationConfigError, TranslationServiceError):
        return text


async def translate_query_to_english(
    query: str, source_lang: str, db: AsyncSession | None = None
) -> str:
    """
    Translate a search query to English.

    If source_lang is already English or query is empty, returns query as-is.
    """
    return await to_english(query, source_lang, db)


async def batch_from_english(
    texts: list[str], target_lang: str, db: AsyncSession | None = None
) -> list[str]:
    """
    Translate multiple texts from English to target language.

    Optimizes by checking cache for all texts first, then batch-translating misses.
    """
    if not texts:
        return []
    if target_lang.lower() in ("english", "en"):
        return texts

    results: list[str | None] = [None] * len(texts)
    texts_to_translate: list[tuple[int, str]] = []

    # Check cache for each text
    for i, text in enumerate(texts):
        if not text or not text.strip():
            results[i] = text
            continue
        if db:
            cached = await _get_cached_translation(db, text, "en", target_lang.lower())
            if cached:
                if _looks_like_poisoned_identity_cache(text, cached, target_lang):
                    await _delete_translation_cache_entry(db, text, "en", target_lang.lower())
                else:
                    results[i] = cached
                    continue
        texts_to_translate.append((i, text))

    # Batch translate uncached texts
    if texts_to_translate:
        try:
            provider = get_translation_provider()
            uncached_texts = [t for _, t in texts_to_translate]
            translated = await provider.translate_batch(uncached_texts, "en", target_lang)
            if len(translated) != len(texts_to_translate):
                logger.warning(
                    "Batch translation length mismatch: got %s, expected %s",
                    len(translated),
                    len(texts_to_translate),
                )
            for j, (idx, original_text) in enumerate(texts_to_translate):
                trans = translated[j] if j < len(translated) else None
                if trans is None or not str(trans).strip():
                    trans = await from_english(original_text, target_lang, db)
                results[idx] = trans
                if db and not _looks_like_poisoned_identity_cache(
                    original_text, str(trans), target_lang
                ):
                    try:
                        await _cache_translation(
                            db, original_text, "en", target_lang.lower(), trans
                        )
                    except Exception:
                        pass  # Ignore cache errors
            if db:
                await db.flush()
        except (TranslationConfigError, TranslationServiceError) as e:
            logger.warning("Batch translation failed: %s; returning originals", e)
            for idx, text in texts_to_translate:
                results[idx] = text

    return [r if r is not None else texts[i] for i, r in enumerate(results)]
