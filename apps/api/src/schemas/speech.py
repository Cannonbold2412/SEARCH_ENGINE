from __future__ import annotations

from pydantic import BaseModel, Field


class SpeechTranscribeResponse(BaseModel):
    """Speech-to-text result for search dictation (Sarvam or Deepgram)."""

    transcript: str = Field(description="Full transcript text")
    chunks: list[str] = Field(
        default_factory=list,
        description="Display tokens (e.g. words) for progressive UI",
    )
    language_code: str | None = Field(default=None, description="Detected or requested BCP-47 code")
