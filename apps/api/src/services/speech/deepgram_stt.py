"""Deepgram prerecorded speech-to-text (Nova family)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from src.core import get_settings
from src.schemas.speech import SpeechTranscribeResponse

logger = logging.getLogger(__name__)

DEEPGRAM_LISTEN_URL = "https://api.deepgram.com/v1/listen"


def normalize_audio_content_type(content_type: str | None) -> str:
    if not content_type or not str(content_type).strip():
        return "application/octet-stream"
    base = str(content_type).split(";")[0].strip().lower()
    if base == "video/webm":
        return "audio/webm"
    return base or "application/octet-stream"


# App ISO 639-1 → Deepgram language query param (omit key → auto-detect)
_APP_TO_DG_LANG: dict[str, str] = {
    "en": "en",
    "hi": "hi",
    "bn": "bn",
    "mr": "mr",
    "ta": "ta",
    "te": "te",
    "kn": "kn",
    "ur": "ur",
}


def resolve_deepgram_language(app_language: str | None) -> str | None:
    if not app_language or not str(app_language).strip():
        return None
    key = str(app_language).strip().lower()
    return _APP_TO_DG_LANG.get(key)


def _chunks_from_alternative(alt: dict[str, Any]) -> list[str]:
    words = alt.get("words")
    if isinstance(words, list):
        out: list[str] = []
        for w in words:
            if not isinstance(w, dict):
                continue
            piece = w.get("word") or w.get("punctuated_word")
            if isinstance(piece, str) and piece.strip():
                out.append(piece.strip())
        if out:
            return out
    transcript = str(alt.get("transcript") or "").strip()
    if not transcript:
        return []
    return [t for t in transcript.split() if t]


def _parse_listen_response(payload: dict[str, Any]) -> SpeechTranscribeResponse:
    results = payload.get("results")
    transcript = ""
    chunks: list[str] = []
    language_code: str | None = None

    if isinstance(results, dict):
        channels = results.get("channels")
        if isinstance(channels, list) and channels:
            ch0 = channels[0]
            if isinstance(ch0, dict):
                dl = ch0.get("detected_language")
                if isinstance(dl, str) and dl.strip():
                    language_code = dl.strip()
                alts = ch0.get("alternatives")
                if isinstance(alts, list) and alts:
                    alt0 = alts[0]
                    if isinstance(alt0, dict):
                        transcript = str(alt0.get("transcript") or "").strip()
                        chunks = _chunks_from_alternative(alt0)

    meta = payload.get("metadata")
    if isinstance(meta, dict) and language_code is None:
        ml = meta.get("language")
        if isinstance(ml, str) and ml.strip():
            language_code = ml.strip()

    if not chunks and transcript:
        chunks = [t for t in transcript.split() if t]

    return SpeechTranscribeResponse(
        transcript=transcript,
        chunks=chunks,
        language_code=language_code,
    )


async def transcribe_with_deepgram(
    audio: bytes,
    filename: str,
    content_type: str | None,
    app_language: str | None,
) -> SpeechTranscribeResponse:
    _ = filename
    settings = get_settings()
    key = (settings.deepgram_api_key or "").strip()
    if not key:
        raise RuntimeError("Speech-to-text (Deepgram) requires DEEPGRAM_API_KEY.")

    model = (settings.deepgram_model or "nova-3").strip() or "nova-3"
    ct = normalize_audio_content_type(content_type)

    params: dict[str, str] = {
        "model": model,
        "smart_format": "true",
    }
    lang = resolve_deepgram_language(app_language)
    if lang:
        params["language"] = lang

    headers = {
        "Authorization": f"Token {key}",
        "Content-Type": ct,
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                DEEPGRAM_LISTEN_URL,
                params=params,
                content=audio,
                headers=headers,
            )
    except httpx.TimeoutException as e:
        logger.warning("Deepgram STT timeout: %s", e)
        raise RuntimeError("Speech-to-text timed out. Try a shorter recording.") from e
    except httpx.RequestError as e:
        logger.warning("Deepgram STT connection error: %s", e)
        raise RuntimeError("Cannot reach speech-to-text service.") from e

    try:
        payload = response.json()
    except Exception:
        payload = {}

    if response.status_code >= 400:
        err = payload.get("err_msg") if isinstance(payload, dict) else None
        msg = "Speech-to-text request failed"
        if isinstance(err, str) and err.strip():
            msg = err.strip()
        elif isinstance(payload, dict):
            for k in ("error", "message", "detail"):
                v = payload.get(k)
                if isinstance(v, str) and v.strip():
                    msg = v.strip()
                    break
        logger.warning("Deepgram STT HTTP %s: %s", response.status_code, msg)
        raise RuntimeError(msg)

    if not isinstance(payload, dict):
        raise RuntimeError("Invalid speech-to-text response")

    return _parse_listen_response(payload)
