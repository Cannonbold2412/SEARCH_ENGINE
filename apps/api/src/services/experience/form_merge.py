"""
Form-merge helpers for the builder endpoints.

These functions convert frontend form dicts (from the clarify/fill flows) into
typed patch objects that can be applied to ORM models.  They live in the service
layer rather than in the router so they can be tested and reused independently.
"""

from datetime import date
from typing import Any

from src.schemas.builder import ExperienceCardPatch

# ---------------------------------------------------------------------------
# Keys used when merging LLM-filled values into the current form state
# ---------------------------------------------------------------------------

#: String-like parent fields that the merge may fill when currently empty.
#: Boolean fields (is_current, experience_card_visibility) are handled
#: separately in ``parent_merged_to_patch``.
PARENT_MERGE_KEYS: tuple[str, ...] = (
    "title",
    "summary",
    "normalized_role",
    "domain",
    "sub_domain",
    "company_name",
    "company_type",
    "location",
    "employment_type",
    "start_date",
    "end_date",
    "intent_primary",
    "intent_secondary_str",
    "seniority_level",
    "confidence_score",
)

# ---------------------------------------------------------------------------
# Core merge logic
# ---------------------------------------------------------------------------


def is_empty(v: Any) -> bool:
    """
    Return ``True`` if *v* is considered "empty" for merge purposes.

    Booleans are never considered empty — they carry intentional state.
    """
    if v is None:
        return True
    if isinstance(v, str):
        return not v.strip()
    if isinstance(v, bool):
        return False
    return False


def merged_form(
    current: dict[str, Any],
    filled: dict[str, Any],
    keys: tuple[str, ...],
) -> dict[str, Any]:
    """
    Return a copy of *current* with empty fields filled from *filled*.

    Only keys listed in *keys* are considered; existing non-empty values are
    never overwritten.
    """
    out = dict(current)
    for k in keys:
        if k not in filled:
            continue
        if is_empty(out.get(k)):
            out[k] = filled[k]
    return out


# ---------------------------------------------------------------------------
# Patch builders
# ---------------------------------------------------------------------------


def _parse_date(value: Any) -> date | None:
    """
    Parse a date from a merged form value.

    Accepts ``YYYY-MM-DD`` or ``YYYY-MM`` (clarify can return partial dates).
    Returns ``None`` on any parse failure.
    """
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    s = s[:10]
    if len(s) == 7 and s[4] == "-":  # YYYY-MM → first of month
        s = f"{s}-01"
    try:
        return date.fromisoformat(s)
    except (ValueError, TypeError):
        return None


def parent_merged_to_patch(merged: dict[str, Any]) -> ExperienceCardPatch:
    """Build an ``ExperienceCardPatch`` from a merged frontend form dict."""
    intent_secondary: list[str] | None = None
    raw_secondary = merged.get("intent_secondary_str")
    if raw_secondary is not None:
        if isinstance(raw_secondary, str):
            intent_secondary = [x.strip() for x in raw_secondary.split(",") if x.strip()]
        elif isinstance(raw_secondary, list):
            intent_secondary = [str(x).strip() for x in raw_secondary if str(x).strip()]

    confidence_score: float | None = None
    raw_confidence = merged.get("confidence_score")
    if raw_confidence is not None and str(raw_confidence).strip():
        try:
            confidence_score = float(raw_confidence)
        except (ValueError, TypeError):
            pass

    return ExperienceCardPatch(
        title=merged.get("title") or None,
        summary=merged.get("summary") or None,
        normalized_role=merged.get("normalized_role") or None,
        domain=merged.get("domain") or None,
        sub_domain=merged.get("sub_domain") or None,
        company_name=merged.get("company_name") or None,
        company_type=merged.get("company_type") or None,
        location=merged.get("location"),  # schema normalises str/dict → str
        employment_type=merged.get("employment_type") or None,
        start_date=_parse_date(merged.get("start_date")),
        end_date=_parse_date(merged.get("end_date")),
        is_current=merged.get("is_current") if isinstance(merged.get("is_current"), bool) else None,
        intent_primary=merged.get("intent_primary") or None,
        intent_secondary=intent_secondary,
        seniority_level=merged.get("seniority_level") or None,
        confidence_score=confidence_score,
        experience_card_visibility=(
            merged.get("experience_card_visibility")
            if isinstance(merged.get("experience_card_visibility"), bool)
            else None
        ),
    )
