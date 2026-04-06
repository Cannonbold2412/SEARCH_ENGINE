"""Helpers for reading loaded ORM instance values as plain Python types."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


async def resolve_viewer_language(
    db: AsyncSession,
    person_id: str,
    explicit_language: str | None,
) -> str:
    """Return effective viewer language, falling back to profile preference.

    Avoids a DB round-trip when the caller already passes a non-English language.
    """
    raw = (explicit_language or "en").strip()
    if raw.lower() not in ("en", "english"):
        return raw
    from src.db.models import PersonProfile  # deferred to avoid circular import

    row = await db.execute(
        select(PersonProfile.preferred_language).where(PersonProfile.person_id == person_id)
    )
    pref = row.scalar_one_or_none()
    if pref and str(pref).strip().lower() not in ("en", "english"):
        return str(pref).strip()
    return "en"


def as_bool(value: Any) -> bool:
    return value if isinstance(value, bool) else False


def as_date(value: Any) -> date | None:
    return value if isinstance(value, date) else None


def as_datetime(value: Any) -> datetime | None:
    return value if isinstance(value, datetime) else None


def as_decimal(value: Any) -> Decimal | None:
    return value if isinstance(value, Decimal) else None


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_str(value: Any) -> str | None:
    return value if isinstance(value, str) else None


def as_nonempty_str(value: Any) -> str | None:
    text = as_str(value)
    if text is None:
        return None
    stripped = text.strip()
    return stripped or None


def as_str_list(value: Any) -> list[str]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes, bytearray)):
        return []
    return [item for item in value if isinstance(item, str)]


def attr_bool(obj: Any, name: str) -> bool:
    return as_bool(getattr(obj, name, None))


def attr_date(obj: Any, name: str) -> date | None:
    return as_date(getattr(obj, name, None))


def attr_datetime(obj: Any, name: str) -> datetime | None:
    return as_datetime(getattr(obj, name, None))


def attr_decimal(obj: Any, name: str) -> Decimal | None:
    return as_decimal(getattr(obj, name, None))


def attr_str(obj: Any, name: str) -> str | None:
    return as_str(getattr(obj, name, None))


def attr_nonempty_str(obj: Any, name: str) -> str | None:
    return as_nonempty_str(getattr(obj, name, None))


def attr_str_list(obj: Any, name: str) -> list[str]:
    return as_str_list(getattr(obj, name, None))
