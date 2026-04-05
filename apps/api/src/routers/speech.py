import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from src.core import get_settings, limiter
from src.db.models import Person
from src.dependencies import get_current_user
from src.schemas.speech import SpeechTranscribeResponse
from src.services.speech import transcribe_with_sarvam

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/speech", tags=["speech"])
_settings = get_settings()

_MAX_AUDIO_BYTES = 12 * 1024 * 1024  # stay under Sarvam short-audio limits


@router.post("/transcribe", response_model=SpeechTranscribeResponse)
@limiter.limit(_settings.speech_transcribe_rate_limit)
async def transcribe_audio(
    request: Request,
    audio_file: Annotated[UploadFile, File(description="Audio (webm, wav, mp3, etc.)")],
    language_code: Annotated[
        str | None,
        Form(description="Optional app language (ISO 639-1); forwarded to Sarvam"),
    ] = None,
    current_user: Person = Depends(get_current_user),
):
    """Proxy to Sarvam speech-to-text using server-side API key (never exposed to the client)."""
    _ = current_user  # auth + rate limit per user
    content = await audio_file.read()
    if len(content) > _MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio file is too large.")
    if len(content) < 256:
        raise HTTPException(status_code=400, detail="Audio is too short or empty.")

    filename = audio_file.filename or "audio.webm"
    try:
        result = await transcribe_with_sarvam(
            content,
            filename=filename,
            content_type=audio_file.content_type,
            app_language=language_code,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except Exception:
        logger.exception("speech transcribe failed")
        raise HTTPException(status_code=502, detail="Speech-to-text failed.") from None

    return result
