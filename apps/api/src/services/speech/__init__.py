from src.core import get_settings
from src.schemas.speech import SpeechTranscribeResponse

from .deepgram_stt import transcribe_with_deepgram
from .sarvam_stt import transcribe_with_sarvam


async def transcribe_upload(
    audio: bytes,
    filename: str,
    content_type: str | None,
    app_language: str | None,
) -> SpeechTranscribeResponse:
    """Route prerecorded STT to Sarvam or Deepgram based on settings."""
    settings = get_settings()
    provider = (settings.speech_transcribe_provider or "sarvam").strip().lower()
    if provider == "deepgram":
        return await transcribe_with_deepgram(
            audio,
            filename=filename,
            content_type=content_type,
            app_language=app_language,
        )
    return await transcribe_with_sarvam(
        audio,
        filename=filename,
        content_type=content_type,
        app_language=app_language,
    )


__all__ = [
    "transcribe_upload",
    "transcribe_with_deepgram",
    "transcribe_with_sarvam",
]
