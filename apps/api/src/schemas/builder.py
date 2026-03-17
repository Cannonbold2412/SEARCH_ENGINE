"""Request/response schemas for the builder (experience card pipeline) endpoints."""

from datetime import datetime, date
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator


# ---------------------------------------------------------------------------
# Raw experience
# ---------------------------------------------------------------------------

class RawExperienceCreate(BaseModel):
    raw_text: str


class RawExperienceResponse(BaseModel):
    id: str
    raw_text: str
    created_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Rewrite
# ---------------------------------------------------------------------------

class RewriteTextResponse(BaseModel):
    """Result of POST /experiences/rewrite: cleaned English text."""

    rewritten_text: str


# ---------------------------------------------------------------------------
# Draft pipeline
# ---------------------------------------------------------------------------

class DraftCardFamily(BaseModel):
    """One parent experience card + its child cards (from draft pipeline)."""

    parent: dict[str, Any]
    children: list[dict[str, Any]] = []


class DraftSetResponse(BaseModel):
    """Result of single-experience pipeline: rewrite → extract one → validate → persist."""

    draft_set_id: str
    raw_experience_id: str
    card_families: list[DraftCardFamily]


class DetectedExperienceItem(BaseModel):
    """One detected experience for user to choose."""

    index: int
    label: str
    suggested: bool = False


class DetectExperiencesResponse(BaseModel):
    """Result of POST /experience-cards/detect-experiences."""

    count: int = 0
    experiences: list[DetectedExperienceItem] = []


class DraftSingleRequest(BaseModel):
    """Request to extract and draft a single experience by index (1-based)."""

    raw_text: str
    experience_index: int = 1
    experience_count: int = 1  # total from detect-experiences; used so LLM knows context


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
# Clarify flow
# ---------------------------------------------------------------------------

class ClarifyMessage(BaseModel):
    """One message in the clarification conversation."""

    role: str  # "assistant" | "user"
    content: str


class ClarifyHistoryMessage(BaseModel):
    """Structured clarify history entry (target-aware)."""

    role: str  # "assistant" | "user"
    kind: str  # "clarify_question" | "clarify_answer"
    target_type: Optional[str] = None         # "parent" | "child"
    target_field: Optional[str] = None
    target_child_type: Optional[str] = None
    profile_axes: Optional[list[str]] = None
    text: str = ""


class LastQuestionTarget(BaseModel):
    """Target of the last asked question (so backend can apply user answer correctly)."""

    target_type: Optional[str] = None    # "parent" | "child"
    target_field: Optional[str] = None
    target_child_type: Optional[str] = None


class ClarifyExperienceRequest(BaseModel):
    """Request for interactive clarification: LLM asks questions or returns filled fields."""

    raw_text: str
    card_type: Literal["parent", "child"] = "parent"
    current_card: dict[str, Any] = {}
    conversation_history: list[ClarifyMessage] = []  # past Q&A (legacy)
    card_id: Optional[str] = None   # if set and filled returned, merge and PATCH parent
    child_id: Optional[str] = None  # if set and filled returned, merge and PATCH child
    card_family: Optional[dict[str, Any]] = None
    card_families: Optional[list[dict[str, Any]]] = None
    detected_experiences: Optional[list[dict[str, Any]]] = None  # [{ "index": int, "label": str }, ...]
    focus_parent_id: Optional[str] = None
    asked_history: Optional[list[dict[str, Any]]] = None
    last_question_target: Optional[dict[str, Any]] = None
    max_parent_questions: Optional[int] = None
    max_child_questions: Optional[int] = None


class ClarifyProgress(BaseModel):
    """Progress counters for clarify loop."""

    parent_asked: int = 0
    child_asked: int = 0
    max_parent: int = 2
    max_child: int = 2


class ClarifyOption(BaseModel):
    """One option for choose_focus action."""

    parent_id: str
    label: str


class ClarifyExperienceResponse(BaseModel):
    """Response: either a clarifying question or filled fields (or both empty when done)."""

    clarifying_question: Optional[str] = None
    filled: dict[str, Any] = {}
    profile_update: Optional[dict[str, Any]] = None
    profile_reflection: Optional[str] = None
    action: Optional[str] = None          # "choose_focus" | null
    message: Optional[str] = None
    options: Optional[list[dict[str, Any]]] = None  # [{ parent_id, label }] for choose_focus
    focus_parent_id: Optional[str] = None
    should_stop: Optional[bool] = None
    stop_reason: Optional[str] = None
    target_type: Optional[str] = None     # "parent" | "child"
    target_field: Optional[str] = None
    target_child_type: Optional[str] = None
    progress: Optional[dict[str, Any]] = None
    missing_fields: Optional[dict[str, Any]] = None
    asked_history_entry: Optional[dict[str, Any]] = None
    canonical_family: Optional[dict[str, Any]] = None


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
    ready_to_commit: bool = False


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
