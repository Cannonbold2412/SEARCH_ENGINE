"""
Single source of truth for the text used to embed experience cards.

For parents: build_parent_search_document() derives text from card fields.
For children: get_child_search_document() derives text from child.value.
Used for semantic embeddings and lexical/full-text search.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import date, datetime
from typing import Any, Protocol

from src.db.models import ExperienceCardChild

from .child_value import get_child_label, normalize_child_value


class ParentCardLike(Protocol):
    title: Any
    normalized_role: Any
    domain: Any
    sub_domain: Any
    company_name: Any
    company_type: Any
    team: Any
    location: Any
    city: Any
    country: Any
    employment_type: Any
    summary: Any
    raw_text: Any
    intent_primary: Any
    intent_secondary: Any
    seniority_level: Any
    start_date: Any
    end_date: Any
    is_current: Any


def _stringify_scalar(value: Any) -> str:
    """Convert a scalar-ish value into trimmed text for indexing."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, Mapping):
        for key in ("text", "label", "name", "city", "country"):
            text = _stringify_scalar(value.get(key))
            if text:
                return text
        return ""
    if isinstance(value, Iterable) and not isinstance(value, (bytes, bytearray)):
        parts = [_stringify_scalar(item) for item in value]
        return " ".join(part for part in parts if part)
    return str(value).strip()


def _dedupe_parts(parts: Iterable[str]) -> list[str]:
    """Preserve order while dropping empty or repeated fragments."""
    seen: set[str] = set()
    out: list[str] = []
    for part in parts:
        cleaned = " ".join(part.split()).strip()
        if not cleaned:
            continue
        key = cleaned.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(cleaned)
    return out


def _format_date_range(card: ParentCardLike) -> str:
    """Format start/end dates for inclusion in the search document."""
    start = _stringify_scalar(getattr(card, "start_date", None))
    end = _stringify_scalar(getattr(card, "end_date", None))
    if start and end:
        return f"{start} - {end}"
    return start or end


def build_parent_search_document(card: ParentCardLike) -> str:
    """Build the searchable/embedding text for a parent experience card."""
    parts = _dedupe_parts(
        [
            _stringify_scalar(getattr(card, "title", None)),
            _stringify_scalar(getattr(card, "normalized_role", None)),
            _stringify_scalar(getattr(card, "domain", None)),
            _stringify_scalar(getattr(card, "sub_domain", None)),
            _stringify_scalar(getattr(card, "company_name", None)),
            _stringify_scalar(getattr(card, "company_type", None)),
            _stringify_scalar(getattr(card, "team", None)),
            _stringify_scalar(getattr(card, "location", None)),
            _stringify_scalar(getattr(card, "city", None)),
            _stringify_scalar(getattr(card, "country", None)),
            _stringify_scalar(getattr(card, "employment_type", None)),
            _stringify_scalar(getattr(card, "summary", None)),
            _stringify_scalar(getattr(card, "raw_text", None)),
            _stringify_scalar(getattr(card, "intent_primary", None)),
            _stringify_scalar(getattr(card, "intent_secondary", None)),
            _stringify_scalar(getattr(card, "seniority_level", None)),
            _format_date_range(card),
            "current" if getattr(card, "is_current", False) else "",
        ]
    )
    return " ".join(parts)


def build_child_search_document_from_value(
    label: str | None,
    value: Mapping[str, Any],
) -> str | None:
    """Build the searchable/embedding text for a child card value."""
    normalized = normalize_child_value(dict(value))
    if not normalized:
        return _stringify_scalar(label) or None

    parts = [_stringify_scalar(label), _stringify_scalar(normalized.get("raw_text"))]
    normalized_items = normalized.get("items")
    items: list[Any] = normalized_items if isinstance(normalized_items, list) else []
    for item in items[:20]:
        if not isinstance(item, Mapping):
            continue
        parts.append(_stringify_scalar(item.get("title")))
        parts.append(_stringify_scalar(item.get("description")))

    doc = " ".join(_dedupe_parts(parts)).strip()
    return doc or None


def get_child_search_document(child: ExperienceCardChild) -> str:
    """Return the search document for a child card."""
    value = child.value if isinstance(child.value, dict) else {}
    label = get_child_label(value, getattr(child, "child_type", "") or "")
    return (build_child_search_document_from_value(label, value) or "").strip()
