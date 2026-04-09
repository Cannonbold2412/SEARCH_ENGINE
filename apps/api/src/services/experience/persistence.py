"""Persistence and response-serialization helpers for experience cards."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import ExperienceCard, ExperienceCardChild
from src.domain import ALLOWED_CHILD_TYPES

from .child_value import dedupe_child_items, normalize_child_items, normalize_child_value
from .errors import PipelineError, PipelineStage
from .field_extractors import (
    _MAX_FIELD_NORM,
    _MAX_FIELD_SHORT,
    _MAX_FIELD_TITLE,
    _MAX_INTENT_SECONDARY,
    _MAX_SUMMARY_LEN,
    extract_company,
    extract_location_fields,
    extract_role_info,
    extract_team,
    extract_time_fields,
    normalize_card_title,
)

logger = logging.getLogger(__name__)


def card_to_experience_card_fields(
    card: Any,
    *,
    person_id: str,
) -> dict[str, Any]:
    """Convert a card-like object into ExperienceCard column values."""
    _time_text, start_date, end_date, is_ongoing = extract_time_fields(card)
    location_text, city, country, is_remote = extract_location_fields(card)
    company = extract_company(card)
    team = extract_team(card)
    role_title, role_seniority = extract_role_info(card)

    raw_text = (card.raw_text or "").strip() or None
    summary = (card.summary or "")[:_MAX_SUMMARY_LEN]
    title = normalize_card_title(card)

    domain = (card.domain or "").strip()[:_MAX_FIELD_SHORT] or None
    sub_domain = (card.sub_domain or "").strip()[:_MAX_FIELD_SHORT] or None

    return {
        "user_id": person_id,
        "raw_text": raw_text,
        "title": title[:_MAX_FIELD_TITLE],
        "normalized_role": role_title,
        "domain": domain,
        "domain_norm": domain.lower().strip()[:_MAX_FIELD_NORM] if domain else None,
        "sub_domain": sub_domain,
        "sub_domain_norm": sub_domain.lower().strip()[:_MAX_FIELD_NORM] if sub_domain else None,
        "company_name": company,
        "company_norm": company.lower().strip()[:_MAX_FIELD_NORM] if company else None,
        "company_type": (card.company_type or "").strip()[:_MAX_FIELD_SHORT] or None,
        "team": team,
        "team_norm": team.lower().strip()[:_MAX_FIELD_NORM] if team else None,
        "start_date": start_date,
        "end_date": end_date,
        "is_current": is_ongoing if isinstance(is_ongoing, bool) else None,
        "location": location_text[:_MAX_FIELD_NORM] if location_text else None,
        "city": city[:_MAX_FIELD_NORM] if city else None,
        "country": country[:_MAX_FIELD_NORM] if country else None,
        "is_remote": is_remote if isinstance(is_remote, bool) else None,
        "employment_type": (card.employment_type or "").strip()[:_MAX_FIELD_SHORT] or None,
        "summary": summary,
        "intent_primary": card.intent or card.intent_primary,
        "intent_secondary": [s for s in card.intent_secondary if isinstance(s, str) and s.strip()][
            :_MAX_INTENT_SECONDARY
        ],
        "seniority_level": role_seniority,
        "confidence_score": card.confidence_score,
        "experience_card_visibility": False,
    }


def card_to_child_fields(
    card: Any,
    *,
    person_id: str,
    parent_id: str,
) -> dict[str, Any]:
    """Convert a card-like object into ExperienceCardChild column values."""
    raw_text = (card.raw_text or "").strip() or None

    child_type = card.child_type
    if not child_type or child_type not in ALLOWED_CHILD_TYPES:
        logger.warning(
            "Invalid child_type %r, defaulting to %r", child_type, ALLOWED_CHILD_TYPES[0]
        )
        child_type = ALLOWED_CHILD_TYPES[0]

    items = getattr(card, "items", None) or []
    items_clean = (
        dedupe_child_items(normalize_child_items(items))
        if isinstance(items, list) and items
        else []
    )

    dimension_container = {
        "raw_text": raw_text,
        "items": items_clean,
    }

    return {
        "parent_experience_id": parent_id,
        "person_id": person_id,
        "child_type": child_type,
        "value": dimension_container,
        "confidence_score": None,
        "embedding": None,
        "extra": {
            "intent": card.intent,
            "created_by": card.created_by,
        }
        if card.intent or card.created_by
        else None,
    }


async def persist_families(
    db: AsyncSession,
    families: list[Any],
    *,
    person_id: str,
) -> tuple[list[ExperienceCard], list[ExperienceCardChild]]:
    """Persist extracted families to the database."""
    all_parents: list[ExperienceCard] = []
    all_children: list[ExperienceCardChild] = []

    try:
        for family in families:
            parent_fields = card_to_experience_card_fields(family.parent, person_id=person_id)
            parent_ec = ExperienceCard(**parent_fields)
            db.add(parent_ec)
            await db.flush()
            await db.refresh(parent_ec)
            all_parents.append(parent_ec)

            for child_card in family.children:
                child_fields = card_to_child_fields(
                    child_card, person_id=person_id, parent_id=parent_ec.id
                )
                val = child_fields.get("value") or {}
                if not val.get("items") and not val.get("raw_text"):
                    continue
                child_ec = ExperienceCardChild(**child_fields)
                db.add(child_ec)
                all_children.append(child_ec)

        if all_children:
            await db.flush()
            await asyncio.gather(*[db.refresh(child_ec) for child_ec in all_children])

        return all_parents, all_children
    except Exception as e:
        raise PipelineError(
            PipelineStage.PERSIST,
            f"Database persistence failed: {str(e)}",
            cause=e,
        ) from e


def serialize_card_for_response(card: ExperienceCard | ExperienceCardChild) -> dict[str, Any]:
    """Convert persisted ORM objects into the API response shape."""
    if isinstance(card, ExperienceCardChild):
        raw_value = card.value if isinstance(card.value, dict) else {}
        value_norm = normalize_child_value(raw_value) or {}
        items_raw = value_norm.get("items") or []
        items = [
            {"title": it.get("title", ""), "description": it.get("description")}
            for it in items_raw
            if isinstance(it, dict) and it.get("title")
        ]
        child_type = getattr(card, "child_type", None) or ""
        return {
            "id": card.id,
            "parent_experience_id": getattr(card, "parent_experience_id", None),
            "child_type": child_type,
            "items": items,
        }

    return {
        "id": card.id,
        "user_id": getattr(card, "person_id", None),
        "title": card.title,
        "normalized_role": card.normalized_role,
        "domain": card.domain,
        "sub_domain": card.sub_domain,
        "company_name": card.company_name,
        "company_type": getattr(card, "company_type", None),
        "team": getattr(card, "team", None),
        "start_date": card.start_date,
        "end_date": card.end_date,
        "is_current": card.is_current,
        "location": card.location,
        "is_remote": getattr(card, "is_remote", None),
        "employment_type": getattr(card, "employment_type", None),
        "summary": card.summary,
        "raw_text": getattr(card, "raw_text", None),
        "intent_primary": getattr(card, "intent_primary", None),
        "intent_secondary": list(card.intent_secondary or []),
        "seniority_level": getattr(card, "seniority_level", None),
        "confidence_score": getattr(card, "confidence_score", None),
        "experience_card_visibility": getattr(card, "experience_card_visibility", True),
        "created_at": card.created_at,
        "updated_at": card.updated_at,
    }
