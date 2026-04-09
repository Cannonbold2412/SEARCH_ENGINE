"""Contact unlock business logic for search results."""

import asyncio

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core import SEARCH_NEVER_EXPIRES
from src.db.models import Person, PersonProfile, Search, UnlockContact
from src.schemas import ContactDetailsResponse, UnlockContactResponse
from src.services.credits import (
    deduct_credits,
    get_balance,
    get_idempotent_response,
    save_idempotent_response,
)

from ._runtime_values import as_dict, attr_bool, attr_str
from .search_logic import _validate_search_session


def unlock_endpoint(person_id: str) -> str:
    """Idempotency endpoint for unlock-contact."""
    return f"POST /people/{person_id}/unlock-contact"


def _contact_response(
    p: PersonProfile | None, person: Person | None = None
) -> ContactDetailsResponse:
    """Build unlock-contact payload, hiding email when profile marks it private."""
    email_visible = attr_bool(p, "email_visible") if p else True
    return ContactDetailsResponse(
        email_visible=email_visible,
        email=(attr_str(person, "email") if person and email_visible else None),
        phone=attr_str(p, "phone") if p else None,
        linkedin_url=attr_str(p, "linkedin_url") if p else None,
        other=attr_str(p, "other") if p else None,
    )


async def unlock_contact(
    db: AsyncSession,
    searcher_id: str,
    person_id: str,
    search_id: str | None,
    idempotency_key: str | None,
) -> UnlockContactResponse:
    """Unlock contact for a person from search results or discover cards."""
    endpoint = unlock_endpoint(person_id)
    if idempotency_key is not None:
        existing = await get_idempotent_response(db, idempotency_key, searcher_id, endpoint)
        response_body = (
            as_dict(getattr(existing, "response_body", None)) if existing is not None else {}
        )
        if response_body:
            return UnlockContactResponse(**response_body)

    if search_id:
        await _validate_search_session(db, searcher_id, search_id, person_id)

    unlock_stmt = select(UnlockContact).where(
        UnlockContact.searcher_id == searcher_id,
        UnlockContact.target_person_id == person_id,
    )
    if search_id:
        unlock_stmt = unlock_stmt.where(UnlockContact.search_id == search_id)
    else:
        unlock_stmt = unlock_stmt.order_by(UnlockContact.created_at.desc()).limit(1)

    profile_result = await db.execute(
        select(PersonProfile).where(PersonProfile.person_id == person_id)
    )
    person_result = await db.execute(select(Person).where(Person.id == person_id))
    u_result = await db.execute(unlock_stmt)
    profile = profile_result.scalar_one_or_none()
    person = person_result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Person profile not found")
    if not (attr_bool(profile, "open_to_work") or attr_bool(profile, "open_to_contact")):
        raise HTTPException(status_code=403, detail="Person is not open to contact")

    if u_result.scalar_one_or_none():
        return UnlockContactResponse(unlocked=True, contact=_contact_response(profile, person))

    balance = await get_balance(db, searcher_id)
    if balance < 1:
        raise HTTPException(status_code=402, detail="Insufficient credits")

    unlock_search_id = search_id
    if not unlock_search_id:
        discover_search = Search(
            searcher_id=searcher_id,
            query_text=f"discover_profile:{person_id}",
            parsed_constraints_json=None,
            extra={"source": "discover_profile"},
            expires_at=SEARCH_NEVER_EXPIRES,
        )
        db.add(discover_search)
        await db.flush()
        unlock_search_id = str(discover_search.id)

    unlock = UnlockContact(
        searcher_id=searcher_id,
        target_person_id=person_id,
        search_id=unlock_search_id,
    )
    db.add(unlock)
    await db.flush()
    if not await deduct_credits(db, searcher_id, 1, "unlock_contact", "unlock_id", str(unlock.id)):
        raise HTTPException(status_code=402, detail="Insufficient credits")

    resp = UnlockContactResponse(unlocked=True, contact=_contact_response(profile, person))
    if idempotency_key is not None:
        await save_idempotent_response(
            db,
            idempotency_key,
            searcher_id,
            endpoint,
            200,
            resp.model_dump(mode="json"),
        )
    return resp
