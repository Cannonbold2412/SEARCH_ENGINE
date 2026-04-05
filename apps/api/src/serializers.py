"""Shared model-to-response serializers."""

from typing import TYPE_CHECKING, Any, cast, get_args

from src.db.models import ExperienceCard, ExperienceCardChild, Person
from src.schemas import ChildValueItem, ExperienceCardChildResponse, ExperienceCardResponse

if TYPE_CHECKING:
    from src.db.models import PersonProfile

from src.domain import (
    CompanyType,
    Confidence,
    EmploymentType,
    ExperienceCardSchema,
    IndexField,
    Intent,
    LocationBasic,
    LocationWithConfidence,
    PersonPrivacyDefaults,
    PersonSchema,
    PersonVerification,
    PrivacyField,
    QualityField,
    RoleItem,
    SeniorityLevel,
    TimeField,
    ToolingField,
    Visibility,
)

# ---------------------------------------------------------------------------
# Module-level constants
# ---------------------------------------------------------------------------

_VALID_INTENTS: tuple[Intent, ...] = get_args(Intent)
_VALID_SENIORITY_LEVELS: tuple[SeniorityLevel, ...] = get_args(SeniorityLevel)
_VALID_EMPLOYMENT_TYPES: tuple[EmploymentType, ...] = get_args(EmploymentType)
_VALID_COMPANY_TYPES: tuple[CompanyType, ...] = get_args(CompanyType)
_DEFAULT_CONFIDENCE: Confidence = "medium"
_PROFILE_PHOTO_URL = "/me/bio/photo"


def _trim_string(value: Any) -> str | None:
    """Return a stripped string or ``None`` if empty."""
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalize_child_value(value: Any) -> dict[str, Any]:
    """Normalize child-card JSON into the canonical ``{raw_text, items}`` shape."""
    if not isinstance(value, dict):
        return {"raw_text": None, "items": []}

    items: list[dict[str, str | None]] = []
    seen: set[tuple[str, str | None]] = set()
    raw_items = value.get("items")

    if isinstance(raw_items, list):
        for item in raw_items:
            if not isinstance(item, dict):
                continue

            title = _trim_string(
                item.get("title") or item.get("subtitle") or item.get("label") or item.get("text")
            )
            if not title:
                continue

            description = _trim_string(
                item.get("description") or item.get("sub_summary") or item.get("summary")
            )
            key = (title, description)
            if key in seen:
                continue
            seen.add(key)
            items.append({"title": title, "description": description})

    return {
        "raw_text": _trim_string(value.get("raw_text")),
        "items": items,
    }


def _normalize_intent(value: str | None) -> Intent:
    """Return a valid domain intent, falling back to ``other``."""
    if value in _VALID_INTENTS:
        return cast(Intent, value)
    return "other"


def _normalize_intent_list(values: list[str] | None) -> list[Intent]:
    """Return only valid domain intents from a raw DB string list."""
    if not values:
        return []
    return [cast(Intent, value) for value in values if value in _VALID_INTENTS]


def _normalize_seniority(value: str | None) -> SeniorityLevel | None:
    """Return a valid seniority level or ``None``."""
    if value in _VALID_SENIORITY_LEVELS:
        return cast(SeniorityLevel, value)
    return None


def _normalize_employment_type(value: str | None) -> EmploymentType | None:
    """Return a valid employment type or ``None``."""
    if value in _VALID_EMPLOYMENT_TYPES:
        return cast(EmploymentType, value)
    return None


def _normalize_company_type(value: str | None) -> CompanyType | None:
    """Return a valid company type or ``None``."""
    if value in _VALID_COMPANY_TYPES:
        return cast(CompanyType, value)
    return None


def experience_card_to_response(card: ExperienceCard) -> ExperienceCardResponse:
    """Map an ``ExperienceCard`` ORM model to ``ExperienceCardResponse``."""
    return ExperienceCardResponse(
        id=card.id,
        user_id=card.user_id,
        title=card.title,
        normalized_role=card.normalized_role,
        domain=card.domain,
        sub_domain=card.sub_domain,
        company_name=card.company_name,
        company_type=card.company_type,
        team=card.team,
        start_date=card.start_date,
        end_date=card.end_date,
        is_current=card.is_current,
        location=card.location,
        is_remote=card.is_remote,
        employment_type=card.employment_type,
        summary=card.summary,
        raw_text=card.raw_text,
        intent_primary=card.intent_primary,
        intent_secondary=card.intent_secondary or [],
        seniority_level=card.seniority_level,
        confidence_score=card.confidence_score,
        experience_card_visibility=card.experience_card_visibility,
        created_at=card.created_at,
        updated_at=card.updated_at,
    )


def experience_card_child_to_response(child: ExperienceCardChild) -> ExperienceCardChildResponse:
    """Map an ``ExperienceCardChild`` ORM model to ``ExperienceCardChildResponse``."""
    value_norm = _normalize_child_value(child.value)
    items_raw = value_norm.get("items") or []
    items = [
        ChildValueItem(title=item.get("title", ""), description=item.get("description"))
        for item in items_raw
        if isinstance(item, dict) and item.get("title")
    ]
    child_type = getattr(child, "child_type", None) or ""

    return ExperienceCardChildResponse(
        id=child.id,
        parent_experience_id=child.parent_experience_id,
        child_type=child_type,
        items=items,
    )


def person_to_person_schema(
    person: Person,
    *,
    profile: "PersonProfile | None" = None,
) -> PersonSchema:
    """Map ``Person`` plus optional ``PersonProfile`` to ``PersonSchema``."""
    location = LocationBasic(
        city=profile.current_city if profile else None,
        region=None,
        country=None,
    )
    verification = PersonVerification(status="unverified", methods=[])

    default_visibility: Visibility = "private"
    if profile and (
        getattr(profile, "open_to_work", False) or getattr(profile, "open_to_contact", False)
    ):
        default_visibility = "searchable"

    privacy_defaults = PersonPrivacyDefaults(default_visibility=default_visibility)
    updated = getattr(person, "updated_at", None) or person.created_at

    return PersonSchema(
        person_id=person.id,
        username=person.email or "",
        display_name=person.display_name or "",
        photo_url=_PROFILE_PHOTO_URL if (profile and profile.profile_photo is not None) else None,
        bio=None,
        location=location,
        verification=verification,
        privacy_defaults=privacy_defaults,
        created_at=person.created_at,
        updated_at=updated,
    )


def experience_card_to_schema(card: ExperienceCard) -> ExperienceCardSchema:
    """Map an ``ExperienceCard`` ORM model to the domain ``ExperienceCardSchema``."""
    seniority = _normalize_seniority(card.seniority_level)
    intent = _normalize_intent(card.intent_primary)
    intent_secondary = _normalize_intent_list(card.intent_secondary)

    time = TimeField(
        start=card.start_date.isoformat() if card.start_date else None,
        end=card.end_date.isoformat() if card.end_date else None,
        ongoing=card.is_current,
        text=None,
        confidence=_DEFAULT_CONFIDENCE,
    )
    location = LocationWithConfidence(
        city=None,
        region=None,
        country=None,
        text=card.location,
        confidence=_DEFAULT_CONFIDENCE,
    )
    roles: list[RoleItem] = []
    if card.normalized_role:
        roles.append(
            RoleItem(
                label=card.normalized_role,
                seniority=seniority,
                confidence=_DEFAULT_CONFIDENCE,
            )
        )

    privacy = PrivacyField(visibility="profile_only", sensitive=False)
    quality = QualityField(
        overall_confidence=_DEFAULT_CONFIDENCE,
        claim_state="self_claim",
        needs_clarification=False,
        clarifying_question=None,
    )
    updated = getattr(card, "updated_at", None) or card.created_at

    return ExperienceCardSchema(
        id=card.id,
        person_id=card.user_id,
        created_by=card.user_id,
        version=1,
        edited_at=updated,
        parent_id=None,
        depth=0,
        relation_type=None,
        intent=intent,
        intent_secondary=intent_secondary,
        headline=card.title or "",
        summary=(card.summary or "")[:500],
        raw_text=card.raw_text or "",
        time=time,
        location=location,
        roles=roles,
        entities=[],
        tooling=ToolingField(),
        outcomes=[],
        evidence=[],
        privacy=privacy,
        quality=quality,
        index=IndexField(),
        seniority_level=seniority,
        employment_type=_normalize_employment_type(card.employment_type),
        company_type=_normalize_company_type(card.company_type),
        created_at=card.created_at,
        updated_at=updated,
    )
