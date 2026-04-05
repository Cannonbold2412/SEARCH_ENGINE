"""Request/response schemas for the builder (experience card pipeline) endpoints."""

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

# ---------------------------------------------------------------------------
# Fill-missing-from-text
# ---------------------------------------------------------------------------


class FillFromTextRequest(BaseModel):
    """Request for fill-missing-from-text: rewrite + fill only missing fields. Optionally persist to DB."""

    raw_text: str
    card_type: Literal["parent", "child"] = "parent"
    current_card: dict[str, Any] = {}
    card_id: str | None = None  # if set, merge and PATCH this parent card
    child_id: str | None = None  # if set, merge and PATCH this child card
    language: str = "en"  # BCP-47 language code; translate non-English to English


class FillFromTextResponse(BaseModel):
    """Response: only the fields the LLM filled (merge into form on frontend)."""

    filled: dict[str, Any] = {}


# ---------------------------------------------------------------------------
# Conversation-first Builder
# ---------------------------------------------------------------------------
class BuilderSessionCommitResponse(BaseModel):
    """Commit response for projecting a Builder session into experience cards."""

    session_id: str
    session_status: str
    working_narrative: str | None = None
    committed_card_ids: list[str] = []
    committed_card_count: int = 0
    cards: list["ExperienceCardResponse"] = []
    children: list["ExperienceCardChildResponse"] = []
    mode: Literal["text", "voice"] | None = None


class BuilderTranscriptCommitRequest(BaseModel):
    """Commit cards from a completed Vapi conversation transcript."""

    call_id: str | None = None
    transcript: str | None = None
    session_id: str | None = None
    mode: Literal["text", "voice"] = "voice"
    language: str = "en"  # BCP-47 language code; translate non-English to English


class FinalizeExperienceCardRequest(BaseModel):
    """Request body to finalize a drafted experience card (make visible + embed)."""

    card_id: str


# ---------------------------------------------------------------------------
# Experience card create / patch / response
# ---------------------------------------------------------------------------


def _location_to_str(v: Any) -> str | None:
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
            x
            for x in (v.get("city"), v.get("region"), v.get("country"))
            if isinstance(x, str) and x.strip()
        ]
        return ", ".join(parts) if parts else None
    return None


class ExperienceCardBase(BaseModel):
    """Shared optional fields for create/patch. Normalises the ``location`` field."""

    title: str | None = None
    normalized_role: str | None = None
    domain: str | None = None
    sub_domain: str | None = None
    company_name: str | None = None
    company_type: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_current: bool | None = None
    location: str | None = None  # accepts str or dict; normalised to str for DB
    is_remote: bool | None = None
    employment_type: str | None = None
    summary: str | None = None
    raw_text: str | None = None
    intent_primary: str | None = None
    intent_secondary: list[str] | None = None
    seniority_level: str | None = None
    confidence_score: float | None = None
    experience_card_visibility: bool | None = None

    @field_validator("location", mode="before")
    @classmethod
    def _normalize_location(cls, v: Any) -> str | None:
        return _location_to_str(v)


class ExperienceCardCreate(ExperienceCardBase):
    """Payload for manually creating an experience card."""


class ExperienceCardPatch(ExperienceCardBase):
    """Payload for patching an existing experience card (all fields optional)."""

    language: str = "en"  # BCP-47 language code; translate non-English to English


class ExperienceCardResponse(BaseModel):
    id: str
    user_id: str
    title: str | None = None
    normalized_role: str | None = None
    domain: str | None = None
    sub_domain: str | None = None
    company_name: str | None = None
    company_type: str | None = None
    team: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_current: bool | None = None
    location: str | None = None
    is_remote: bool | None = None
    employment_type: str | None = None
    summary: str | None = None
    raw_text: str | None = None
    intent_primary: str | None = None
    intent_secondary: list[str] = []
    seniority_level: str | None = None
    confidence_score: float | None = None
    experience_card_visibility: bool = True
    created_at: datetime | None = None
    updated_at: datetime | None = None

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

    items: list[dict[str, Any]] | None = None


class ChildValueItem(BaseModel):
    """One item in a child card ``value.items[]``."""

    title: str
    description: str | None = None


class ExperienceCardChildResponse(BaseModel):
    """Response DTO for ExperienceCardChild."""

    id: str
    parent_experience_id: str | None = None
    child_type: str = ""
    items: list[ChildValueItem] = []

    model_config = ConfigDict(from_attributes=True)


class CardFamilyResponse(BaseModel):
    """One parent experience card and its child cards (for saved cards list)."""

    parent: ExperienceCardResponse
    children: list[ExperienceCardChildResponse] = []


# ---------------------------------------------------------------------------
# Commit full draft (enhance flow — single transaction)
# ---------------------------------------------------------------------------


class CommitCardDraftChild(BaseModel):
    """
    One child row to upsert. If ``id`` is set, update that row; otherwise create
    or update by ``child_type`` (unique per parent).
    """

    id: str | None = None
    child_type: str = ""
    items: list[Any] = []

    @model_validator(mode="after")
    def _validate_new_child(self) -> "CommitCardDraftChild":
        from src.domain import ALLOWED_CHILD_TYPES

        if self.id is None:
            ct = (self.child_type or "").strip()
            if not ct or ct not in ALLOWED_CHILD_TYPES:
                raise ValueError("When id is omitted, child_type must be a valid dimension type.")
        return self


class CommitCardDraftRequest(BaseModel):
    """Persist a full parent + children draft from the enhance editor (one shot)."""

    parent: ExperienceCardPatch
    children: list[CommitCardDraftChild] = []
