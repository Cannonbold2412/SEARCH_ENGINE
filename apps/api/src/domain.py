"""
Domain types and schemas for Experience Cards.
Single source of truth for prompts, validation, and API responses.
"""

from datetime import datetime
from typing import Literal, get_args

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# 1. Enums (Literal types used for validation and prompt generation)
# ---------------------------------------------------------------------------

Intent = Literal[
    "work",
    "education",
    "project",
    "business",
    "research",
    "practice",
    "exposure",
    "achievement",
    "transition",
    "learning",
    "life_context",
    "community",
    "finance",
    "other",
    "mixed",
]

ChildIntent = Literal[
    "responsibility",
    "capability",
    "method",
    "outcome",
    "learning",
    "challenge",
    "decision",
    "evidence",
]

ChildRelationType = Literal[
    "describes",
    "supports",
    "demonstrates",
    "results_in",
    "learned_from",
    "involves",
    "part_of",
]

SeniorityLevel = Literal[
    "intern",
    "junior",
    "mid",
    "senior",
    "lead",
    "principal",
    "staff",
    "manager",
    "director",
    "vp",
    "executive",
    "founder",
    "independent",
    "volunteer",
    "student",
    "apprentice",  # learning under a master/ustaad
    "owner",  # family business / own shop
    "other",
]

EmploymentType = Literal[
    "full_time",
    "part_time",
    "contract",
    "freelance",
    "internship",
    "volunteer",
    "self_employed",
    "founder",
    "apprenticeship",  # formal or informal, under a master
    "family_business",  # working in a family-owned business
    "daily_wage",  # informal daily wage / labour
    "gig",  # gig economy (delivery, ride-share, etc.)
    "other",
]

CompanyType = Literal[
    "startup",
    "scaleup",
    "mnc",
    "sme",
    "agency",
    "ngo",
    "government",
    "university",
    "research_institution",
    "self_employed",
    "cooperative",
    "family_business",  # family-owned business
    "informal",  # street vendor, local shop, dhaba, etc.
    "master_apprentice",  # ustaad/master-based learning or work
    "other",
]

Confidence = Literal["high", "medium", "low"]

Visibility = Literal["private", "profile_only", "searchable"]

ClaimState = Literal["self_claim", "supported", "verified"]

EvidenceType = Literal["link", "file", "reference"]

ToolType = Literal[
    "software",
    "equipment",
    "system",
    "platform",
    "instrument",
    "other",
]

EntityType = Literal[
    "person",
    "organization",
    "company",
    "school",
    "team",
    "community",
    "place",
    "event",
    "program",
    "domain",
    "industry",
    "product",
    "service",
    "artifact",
    "document",
    "portfolio_item",
    "credential",
    "award",
    "tool",
    "equipment",
    "system",
    "platform",
    "instrument",
    "method",
    "process",
]

# Describes how two parallel experiences relate to each other.
ExperienceRelationType = Literal[
    "parallel",  # running simultaneously (job + side business)
    "sequential",  # one after the other
    "nested",  # one within the other (project within a job)
    "transitional",  # one led directly to the other
]

# ---------------------------------------------------------------------------
# 2. Constants
# ---------------------------------------------------------------------------

ALLOWED_CHILD_TYPES: tuple[str, ...] = (
    "skills",
    "tools",
    "metrics",
    "achievements",
    "responsibilities",
    "collaborations",
    "domain_knowledge",
    "exposure",
    "education",
    "certifications",
)

ENTITY_TAXONOMY: list[str] = list(get_args(EntityType))

# ---------------------------------------------------------------------------
# 3. Nested field models
# ---------------------------------------------------------------------------


class TimeField(BaseModel):
    start: str | None = None  # YYYY-MM | YYYY-MM-DD
    end: str | None = None
    ongoing: bool | None = None
    text: str | None = None  # user's original phrasing
    confidence: Confidence


class LocationField(BaseModel):
    city: str | None = None
    region: str | None = None
    country: str | None = None
    text: str | None = None  # user's original phrasing
    is_remote: bool | None = None
    confidence: Confidence


class RoleItem(BaseModel):
    label: str
    seniority: SeniorityLevel | None = None
    confidence: Confidence


class EntityItem(BaseModel):
    type: EntityType
    name: str
    entity_id: str | None = None
    confidence: Confidence


class ToolItem(BaseModel):
    name: str
    type: ToolType
    confidence: Confidence


class ToolingField(BaseModel):
    tools: list[ToolItem] = Field(default_factory=list)
    raw: str | None = None


class OutcomeMetric(BaseModel):
    name: str | None = None
    value: float | None = None
    unit: str | None = None


class OutcomeItem(BaseModel):
    type: str
    label: str
    value_text: str | None = None
    metric: OutcomeMetric
    confidence: Confidence


class EvidenceItem(BaseModel):
    type: EvidenceType
    url: str | None = None
    note: str | None = None
    visibility: Visibility


class PrivacyField(BaseModel):
    visibility: Visibility
    sensitive: bool


class QualityField(BaseModel):
    overall_confidence: Confidence
    claim_state: ClaimState
    needs_clarification: bool
    clarifying_question: str | None = None


class IndexField(BaseModel):
    embedding_ref: str | None = None


# ---------------------------------------------------------------------------
# Person (profile) domain types
# ---------------------------------------------------------------------------


class LocationBasic(BaseModel):
    """Simple location for person profile (no confidence field)."""

    city: str | None = None
    region: str | None = None
    country: str | None = None


class PersonVerification(BaseModel):
    status: str = "unverified"
    methods: list[str] = Field(default_factory=list)


class PersonPrivacyDefaults(BaseModel):
    default_visibility: str = "private"


class PersonSchema(BaseModel):
    """Person profile schema (for /profile, serializers)."""

    person_id: str
    username: str
    display_name: str
    photo_url: str | None = None
    bio: str | None = None
    location: LocationBasic
    verification: PersonVerification
    privacy_defaults: PersonPrivacyDefaults
    created_at: datetime
    updated_at: datetime


# LocationWithConfidence is the same shape as LocationField.
# The alias exists so serializers can import a semantically distinct name
# without duplicating the model definition.
LocationWithConfidence = LocationField


class ExperienceRelation(BaseModel):
    """Links two experience cards that overlapped in time."""

    related_card_id: str
    relation_type: ExperienceRelationType
    note: str | None = None  # e.g. "ran this side business while employed at X"


# ---------------------------------------------------------------------------
# 4. Experience Card schemas
# ---------------------------------------------------------------------------


class ExperienceCardBase(BaseModel):
    """Shared fields for parent and child cards."""

    id: str
    person_id: str
    created_by: str
    version: Literal[1] = 1
    edited_at: datetime | None = None
    headline: str
    summary: str
    raw_text: str
    time: TimeField
    location: LocationField
    roles: list[RoleItem] = Field(default_factory=list)
    entities: list[EntityItem] = Field(default_factory=list)
    tooling: ToolingField = Field(default_factory=ToolingField)
    outcomes: list[OutcomeItem] = Field(default_factory=list)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    privacy: PrivacyField
    quality: QualityField
    index: IndexField = Field(default_factory=IndexField)
    created_at: datetime
    updated_at: datetime


class ExperienceCardParentSchema(ExperienceCardBase):
    """Parent card — root of a card family."""

    parent_id: str | None = None
    depth: Literal[0] = 0
    relation_type: str | None = None
    intent: Intent
    intent_secondary: list[Intent] = Field(default_factory=list)
    seniority_level: SeniorityLevel | None = None
    employment_type: EmploymentType | None = None
    company_type: CompanyType | None = None
    relations: list[ExperienceRelation] = Field(default_factory=list)


ExperienceCardSchema = ExperienceCardParentSchema
