"""Sarvam REST speech-to-text (same API key as translation by default)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from src.core import get_settings
from src.schemas.speech import SpeechTranscribeResponse

logger = logging.getLogger(__name__)

SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text"


def normalize_audio_content_type(content_type: str | None) -> str:
    """Sarvam rejects parameterized types like audio/webm;codecs=opus — use the base MIME."""
    if not content_type or not str(content_type).strip():
        return "application/octet-stream"
    base = str(content_type).split(";")[0].strip().lower()
    if base == "video/webm":
        return "audio/webm"
    return base or "application/octet-stream"


# App ISO 639-1 (visibility / UI) → Sarvam STT language_code
_APP_TO_STT_LANG: dict[str, str] = {
    "en": "en-IN",
    "hi": "hi-IN",
    "bn": "bn-IN",
    "mr": "mr-IN",
    "ta": "ta-IN",
    "te": "te-IN",
    "kn": "kn-IN",
    "ur": "ur-IN",
}


def resolve_stt_language_code(app_language: str | None) -> str:
    if not app_language or not str(app_language).strip():
        return "unknown"
    key = str(app_language).strip().lower()
    return _APP_TO_STT_LANG.get(key, "unknown")


def _chunks_from_response(body: dict[str, Any]) -> list[str]:
    transcript = (body.get("transcript") or "").strip()
    timestamps = body.get("timestamps")
    if isinstance(timestamps, dict):
        words = timestamps.get("words")
        if isinstance(words, list):
            out = [w for w in words if isinstance(w, str) and w.strip()]
            if out:
                return out
    if not transcript:
        return []
    return [t for t in transcript.split() if t]


async def transcribe_with_sarvam(
    audio: bytes,
    filename: str,
    content_type: str | None,
    app_language: str | None,
) -> SpeechTranscribeResponse:
    settings = get_settings()
    key = (settings.translation_api_key or "").strip()
    if not key:
        raise RuntimeError(
            "Speech-to-text requires TRANSLATION_API_KEY (Sarvam api-subscription-key)."
        )

    lang = resolve_stt_language_code(app_language)
    ct = normalize_audio_content_type(content_type)
    files = {"file": (filename, audio, ct)}
    data: dict[str, str] = {
        "model": "saaras:v3",
        "mode": "transcribe",
        "language_code": lang,
    }

    headers = {"api-subscription-key": key}

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                SARVAM_STT_URL,
                files=files,
                data=data,
                headers=headers,
            )
    except httpx.TimeoutException as e:
        logger.warning("Sarvam STT timeout: %s", e)
        raise RuntimeError("Speech-to-text timed out. Try a shorter recording.") from e
    except httpx.RequestError as e:
        logger.warning("Sarvam STT connection error: %s", e)
        raise RuntimeError("Cannot reach speech-to-text service.") from e

    try:
        payload = response.json()
    except Exception:
        payload = {}

    if response.status_code >= 400:
        err = payload.get("error") if isinstance(payload, dict) else None
        msg = "Speech-to-text request failed"
        if isinstance(err, dict) and err.get("message"):
            msg = str(err["message"])
        elif isinstance(payload, dict) and payload.get("detail"):
            msg = str(payload["detail"])
        logger.warning("Sarvam STT HTTP %s: %s", response.status_code, msg)
        raise RuntimeError(msg)

    if not isinstance(payload, dict):
        raise RuntimeError("Invalid speech-to-text response")

    transcript = str(payload.get("transcript") or "").strip()
    lc = payload.get("language_code")
    language_code = str(lc) if lc is not None else None

    return SpeechTranscribeResponse(
        transcript=transcript,
        chunks=_chunks_from_response(payload),
        language_code=language_code,
    )
