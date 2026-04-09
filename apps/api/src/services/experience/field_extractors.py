"""Field extraction helpers for experience cards."""

from __future__ import annotations

import re
from datetime import date
from typing import Any

_MAX_FIELD_SHORT = 100
_MAX_FIELD_NORM = 255
_MAX_FIELD_TITLE = 500
_MAX_SUMMARY_LEN = 10_000
_MAX_INTENT_SECONDARY = 20

_DATE_ISO_IN_TEXT = re.compile(r"\d{4}-\d{2}(?:-\d{2})?")
CardLike = Any


def parse_date_field(value: str | None) -> date | None:
    """Parse an ISO date string or ISO year-month string."""
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    normalized = (
        text.replace("/", "-").replace(".", "-").replace("–", "-").replace("—", "-").strip()
    )
    normalized = re.sub(r"[,\s]+", " ", normalized).strip().replace(" ", "-")
    if len(normalized) == 7 and normalized[4] == "-":
        normalized = f"{normalized}-01"
    try:
        return date.fromisoformat(normalized)
    except ValueError:
        return None


def _extract_dates_from_text(text: str) -> tuple[date | None, date | None]:
    if not text:
        return None, None
    haystack = str(text).replace("–", "-").replace("—", "-")
    matches = _DATE_ISO_IN_TEXT.findall(haystack)
    parsed = [parse_date_field(m) for m in matches if m]
    parsed = [d for d in parsed if d is not None]
    if not parsed:
        return None, None
    if len(parsed) == 1:
        return parsed[0], None
    return parsed[0], parsed[1]


def _has_attrs(obj: Any, *attrs: str) -> bool:
    return obj is not None and all(hasattr(obj, attr) for attr in attrs)


def extract_time_fields(
    card: CardLike,
) -> tuple[str | None, date | None, date | None, bool | None]:
    """Extract time fields from a card-like object."""
    time_obj = card.time

    explicit_start = parse_date_field(card.start_date)
    explicit_end = parse_date_field(card.end_date)
    explicit_text = (card.time_text or "").strip() or None
    explicit_ongoing = card.is_current if isinstance(card.is_current, bool) else None

    if isinstance(time_obj, str):
        start_date, end_date = _extract_dates_from_text(time_obj)
        if start_date is None:
            start_date = explicit_start
        if end_date is None:
            end_date = explicit_end
        ongoing = explicit_ongoing
        if ongoing is None and re.search(
            r"\b(present|current|ongoing|now)\b", time_obj, re.IGNORECASE
        ):
            ongoing = True
        return time_obj, start_date, end_date, ongoing

    if not _has_attrs(time_obj, "text", "start", "end", "ongoing"):
        if (explicit_start is None or explicit_end is None) and explicit_text:
            parsed_start, parsed_end = _extract_dates_from_text(explicit_text)
            if explicit_start is None:
                explicit_start = parsed_start
            if explicit_end is None:
                explicit_end = parsed_end
        return explicit_text, explicit_start, explicit_end, explicit_ongoing

    time_text = (getattr(time_obj, "text", None) or "").strip() or explicit_text
    start_date = parse_date_field(getattr(time_obj, "start", None))
    end_date = parse_date_field(getattr(time_obj, "end", None))
    if start_date is None:
        start_date = explicit_start
    if end_date is None:
        end_date = explicit_end
    if (start_date is None or end_date is None) and time_text:
        parsed_start, parsed_end = _extract_dates_from_text(time_text)
        if start_date is None:
            start_date = parsed_start
        if end_date is None:
            end_date = parsed_end
    ongoing = (
        getattr(time_obj, "ongoing", None)
        if isinstance(getattr(time_obj, "ongoing", None), bool)
        else explicit_ongoing
    )
    if (
        ongoing is None
        and time_text
        and re.search(r"\b(present|current|ongoing|now)\b", time_text, re.IGNORECASE)
    ):
        ongoing = True
    return time_text, start_date, end_date, ongoing


def extract_location_fields(
    card: CardLike,
) -> tuple[str | None, str | None, str | None, bool | None]:
    """Extract location fields from a card-like object."""
    loc_obj = card.location
    if isinstance(loc_obj, str):
        return loc_obj, None, None, None
    if not _has_attrs(loc_obj, "text", "city", "country", "is_remote"):
        return None, None, None, None
    return (
        getattr(loc_obj, "text", None) or getattr(loc_obj, "city", None),
        getattr(loc_obj, "city", None),
        getattr(loc_obj, "country", None),
        getattr(loc_obj, "is_remote", None)
        if isinstance(getattr(loc_obj, "is_remote", None), bool)
        else None,
    )


def extract_company(card: CardLike) -> str | None:
    company = card.company or card.company_name or card.organization
    if not company:
        for entity in card.entities:
            if entity.type in {"company", "organization"}:
                company = entity.name
                break
    return company[:_MAX_FIELD_NORM].strip() if company else None


def extract_team(card: CardLike) -> str | None:
    team = card.team
    if not team:
        for entity in card.entities:
            if entity.type == "team":
                team = entity.name
                break
    return team[:_MAX_FIELD_NORM].strip() if team else None


def extract_role_info(card: CardLike) -> tuple[str | None, str | None]:
    if card.roles:
        first_role = card.roles[0]
        title = first_role.label[:_MAX_FIELD_NORM].strip() if first_role.label else None
        seniority = first_role.seniority[:_MAX_FIELD_NORM].strip() if first_role.seniority else None
        if title or seniority:
            return title, seniority
    title = (card.normalized_role or "").strip()[:_MAX_FIELD_NORM] or None
    seniority = (card.seniority_level or "").strip()[:_MAX_FIELD_NORM] or None
    return title, seniority


def normalize_card_title(card: CardLike, fallback_text: str | None = None) -> str:
    _GENERIC_TITLES = {"general experience", "unspecified experience"}
    _FIRST_LINE_MAX = 80

    headline = (card.headline or "").strip()
    if headline and headline.lower() not in _GENERIC_TITLES:
        return headline[:_MAX_FIELD_TITLE]

    title = (card.title or "").strip()
    if title and title.lower() not in _GENERIC_TITLES:
        return title[:_MAX_FIELD_TITLE]

    summary = (card.summary or "").strip()
    if summary:
        first_line = summary.split("\n")[0].strip()[:_FIRST_LINE_MAX]
        if first_line:
            return first_line

    raw_text = (card.raw_text or "").strip()
    if raw_text:
        first_line = raw_text.split("\n")[0].strip()[:_FIRST_LINE_MAX]
        if first_line:
            return first_line

    if fallback_text:
        return fallback_text.split("\n")[0].strip()[:_FIRST_LINE_MAX] or "Experience"

    return "Experience"
