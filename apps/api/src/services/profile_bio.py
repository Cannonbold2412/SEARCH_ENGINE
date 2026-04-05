"""BioResponse shaping shared by profile routes and locale_display."""

from __future__ import annotations

from typing import Any

from src.db.models import Person, PersonProfile
from src.schemas import BioResponse, PastCompanyItem


def past_companies_to_items(past: list[dict[str, Any]] | None) -> list[PastCompanyItem]:
    if not past or not isinstance(past, list):
        return []
    return [
        PastCompanyItem(
            company_name=p.get("company_name", ""),
            role=p.get("role"),
            years=p.get("years"),
        )
        for p in past
        if isinstance(p, dict)
    ]


def bio_response_from_profile(person: Person, profile: PersonProfile | None) -> BioResponse:
    """Build BioResponse from Person + PersonProfile (English DB fields)."""
    past = past_companies_to_items(profile.past_companies if profile else None)
    complete = bool(profile and (profile.school or "").strip() and (person.email or "").strip())
    has_photo = profile is not None and profile.profile_photo is not None
    return BioResponse(
        first_name=profile.first_name if profile else None,
        last_name=profile.last_name if profile else None,
        date_of_birth=profile.date_of_birth if profile else None,
        current_city=profile.current_city if profile else None,
        profile_photo_url="/me/bio/photo" if has_photo else None,
        school=profile.school if profile else None,
        college=profile.college if profile else None,
        current_company=profile.current_company if profile else None,
        past_companies=past,
        email=person.email,
        linkedin_url=profile.linkedin_url if profile else None,
        phone=profile.phone if profile else None,
        complete=complete,
    )
