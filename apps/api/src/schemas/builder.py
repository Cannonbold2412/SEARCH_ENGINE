"""Request/response schemas for the builder (experience card pipeline) endpoints."""

from datetime import datetime, date
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator


# ---------------------------------------------------------------------------
# Fill-missing-from-text
# ---------------------------------------------------------------------------

class FillFromTextRequest(BaseModel):
    """Request for fill-missing-from-text: rewrite + fill only missing fields. Optionally persist to DB."""

    raw_text: str
    card_type: Literal["parent", "child"] = "parent"
    current_card: dict[str, Any] = {}
    card_id: Optional[str] = None   # if set, merge and PATCH this parent card
    child_id: Optional[str] = None  # if set, merge and PATCH this child card


class FillFromTextResponse(BaseModel):
    """Response: only the fields the LLM filled (merge into form on frontend)."""

    filled: dict[str, Any] = {}


# ---------------------------------------------------------------------------
# Conversation-first Builder
# ---------------------------------------------------------------------------

class BuilderChatTurnRequest(BaseModel):
    """One conversation turn for the new Builder engine."""

    session_id: Optional[str] = None
    person_id: Optional[str] = None
    message: str
    mode: Literal["text", "voice"] = "text"


class BuilderTurnResponse(BaseModel):
    """One visible Builder turn."""

    id: str
    role: Literal["user", "assistant"]
    content: str
    turn_index: int
    message_type: Optional[str] = None
    created_at: Optional[datetime] = None


class BuilderChatTurnResponse(BaseModel):
    """Frontend-safe response for one Builder conversation turn."""

    session_id: str
    assistant_message: str
    working_narrative: Optional[str] = None
    surfaced_insights: list[str] = []
    should_continue: bool = True
    session_status: str
    # When true, the chat agent ended and extraction can be queued/committed.
    ready_to_commit: bool = False
    # True when backend queued background schema extraction/commit for this session.
    extract_schema_queued: bool = False


class BuilderSessionResponse(BaseModel):
    """Current state of a Builder session."""

    session_id: str
    mode: Literal["text", "voice"]
    session_status: str
    current_focus: Optional[str] = None
    working_narrative: Optional[str] = None
    turn_count: int = 0
    stop_confidence: float = 0.0
    surfaced_insights: list[str] = []
    should_continue: bool = True
    ready_to_commit: bool = False
    turns: list[BuilderTurnResponse] = []


class BuilderSessionCommitResponse(BaseModel):
    """Commit response for projecting a Builder session into experience cards."""

    session_id: str
    session_status: str
    working_narrative: Optional[str] = None
    committed_card_ids: list[str] = []
    committed_card_count: int = 0


class BuilderTranscriptCommitRequest(BaseModel):
    """Commit cards from a completed Vapi conversation transcript."""

    call_id: Optional[str] = None
    transcript: Optional[str] = None
    session_id: Optional[str] = None
    mode: Literal["text", "voice"] = "voice"


# ---------------------------------------------------------------------------
# Finalize / commit
# ---------------------------------------------------------------------------

class CommitDraftSetRequest(BaseModel):
    """Optional body for commit: approve only selected card ids, or all if omitted."""

    card_ids: Optional[list[str]] = None


class FinalizeExperienceCardRequest(BaseModel):
    """Request body to finalize a drafted experience card (make visible + embed)."""

    card_id: str


# ---------------------------------------------------------------------------
# Experience card create / patch / response
# ---------------------------------------------------------------------------

def _location_to_str(v: Any) -> Optional[str]:
    """Convert location value (str or dict) to a plain string for DB storage."""
    if v is None:
        return None
    if isinstance(v, str):
        return v.strip() or None
    if isinstance(v, dict):
        text = v.get("text")
        if isinstance(text, str) and text.strip():
            return text.strip()
        parts = [
            x for x in (v.get("city"), v.get("region"), v.get("country"))
            if isinstance(x, str) and x.strip()
        ]
        return ", ".join(parts) if parts else None
    return None


class ExperienceCardBase(BaseModel):
    """Shared optional fields for create/patch. Normalises the ``location`` field."""

    title: Optional[str] = None
    normalized_role: Optional[str] = None
    domain: Optional[str] = None
    sub_domain: Optional[str] = None
    company_name: Optional[str] = None
    company_type: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_current: Optional[bool] = None
    location: Optional[str] = None  # accepts str or dict; normalised to str for DB
    is_remote: Optional[bool] = None
    employment_type: Optional[str] = None
    summary: Optional[str] = None
    raw_text: Optional[str] = None
    intent_primary: Optional[str] = None
    intent_secondary: Optional[list[str]] = None
    seniority_level: Optional[str] = None
    confidence_score: Optional[float] = None
    experience_card_visibility: Optional[bool] = None

    @field_validator("location", mode="before")
    @classmethod
    def _normalize_location(cls, v: Any) -> Optional[str]:
        return _location_to_str(v)


class ExperienceCardCreate(ExperienceCardBase):
    """Payload for manually creating an experience card."""


class ExperienceCardPatch(ExperienceCardBase):
    """Payload for patching an existing experience card (all fields optional)."""


class ExperienceCardResponse(BaseModel):
    id: str
    user_id: str
    title: Optional[str] = None
    normalized_role: Optional[str] = None
    domain: Optional[str] = None
    sub_domain: Optional[str] = None
    company_name: Optional[str] = None
    company_type: Optional[str] = None
    team: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_current: Optional[bool] = None
    location: Optional[str] = None
    is_remote: Optional[bool] = None
    employment_type: Optional[str] = None
    summary: Optional[str] = None
    raw_text: Optional[str] = None
    intent_primary: Optional[str] = None
    intent_secondary: list[str] = []
    seniority_level: Optional[str] = None
    confidence_score: Optional[float] = None
    experience_card_visibility: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Experience card children
# ---------------------------------------------------------------------------

class ExperienceCardChildPatch(BaseModel):
    """
    Patch payload for ExperienceCardChild.
    Updates are applied into ``child.value`` (dimension container).
    ``value.items`` uses ``ChildValueItem`` shape: ``{ title, description }``.
    """

    items: Optional[list[dict[str, Any]]] = None


class ChildValueItem(BaseModel):
    """One item in a child card ``value.items[]``."""

    title: str
    description: Optional[str] = None


class ExperienceCardChildResponse(BaseModel):
    """Response DTO for ExperienceCardChild."""

    id: str
    parent_experience_id: Optional[str] = None
    child_type: str = ""
    items: list[ChildValueItem] = []

    model_config = ConfigDict(from_attributes=True)


class CardFamilyResponse(BaseModel):
    """One parent experience card and its child cards (for saved cards list)."""

    parent: ExperienceCardResponse
    children: list[ExperienceCardChildResponse] = []
