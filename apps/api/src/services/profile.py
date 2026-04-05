"""Profile (visibility, bio, credits, contact) business logic."""


from fastapi import HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import CreditLedger, Person, PersonProfile
from src.domain import ExperienceCardSchema, PersonSchema
from src.schemas import (
    BioCreateUpdate,
    BioResponse,
    CardFamilyResponse,
    ContactDetailsResponse,
    CreditsResponse,
    ExperienceCardChildResponse,
    ExperienceCardResponse,
    LedgerEntryResponse,
    PatchContactRequest,
    PatchProfileRequest,
    PatchVisibilityRequest,
    PersonResponse,
    PurchaseCreditsRequest,
    VisibilitySettingsResponse,
)
from src.serializers import (
    experience_card_child_to_response,
    experience_card_to_response,
    experience_card_to_schema,
    person_to_person_schema,
)
from src.services.credits import add_credits as add_credits_to_wallet
from src.services.experience import experience_card_service
from src.services.locale_display import bump_english_content_version, get_or_build_localized_pack
from src.services.profile_bio import (
    bio_response_from_profile,
)
from src.services.profile_bio import (
    past_companies_to_items as _past_companies_to_items,
)


def _person_response(person: Person) -> PersonResponse:
    return PersonResponse(
        id=person.id,
        email=person.email,
        display_name=person.display_name,
        created_at=person.created_at,
    )


async def get_profile(person: Person) -> PersonResponse:
    return _person_response(person)


async def update_profile(
    db: AsyncSession, person: Person, body: PatchProfileRequest
) -> PersonResponse:
    if body.display_name is not None:
        person.display_name = body.display_name
        await bump_english_content_version(db, person.id)
    return _person_response(person)


async def _get_visibility(db: AsyncSession, person_id: str) -> VisibilitySettingsResponse:
    result = await db.execute(select(PersonProfile).where(PersonProfile.person_id == person_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return VisibilitySettingsResponse(
        open_to_work=profile.open_to_work,
        work_preferred_locations=profile.work_preferred_locations or [],
        work_preferred_salary_min=profile.work_preferred_salary_min,
        open_to_contact=profile.open_to_contact,
        preferred_language=profile.preferred_language,
    )


async def _patch_visibility(
    db: AsyncSession,
    person_id: str,
    body: PatchVisibilityRequest,
) -> VisibilitySettingsResponse:
    result = await db.execute(select(PersonProfile).where(PersonProfile.person_id == person_id))
    profile = result.scalar_one_or_none()
    if not profile:
        profile = PersonProfile(person_id=person_id)
        db.add(profile)
        try:
            await db.flush()
        except IntegrityError:
            # Concurrent request created the profile; re-load it.
            await db.rollback()
            result = await db.execute(
                select(PersonProfile).where(PersonProfile.person_id == person_id)
            )
            profile = result.scalar_one_or_none()
            if not profile:
                raise
    if body.open_to_work is not None:
        profile.open_to_work = body.open_to_work
    if body.work_preferred_locations is not None:
        profile.work_preferred_locations = body.work_preferred_locations
    if body.work_preferred_salary_min is not None:
        profile.work_preferred_salary_min = body.work_preferred_salary_min
    if body.open_to_contact is not None:
        profile.open_to_contact = body.open_to_contact
    if body.preferred_language is not None:
        profile.preferred_language = body.preferred_language
    return VisibilitySettingsResponse(
        open_to_work=profile.open_to_work,
        work_preferred_locations=profile.work_preferred_locations or [],
        work_preferred_salary_min=profile.work_preferred_salary_min,
        open_to_contact=profile.open_to_contact,
        preferred_language=profile.preferred_language,
    )


async def upload_profile_photo(
    db: AsyncSession,
    person: Person,
    file: UploadFile,
) -> None:
    """Save uploaded image to DB (profile_photo, profile_photo_media_type)."""
    allowed = ("image/jpeg", "image/png", "image/gif", "image/webp")
    media_type = (file.content_type or "").strip().lower()
    if media_type and media_type not in allowed:
        raise HTTPException(
            status_code=400, detail="Only JPEG, PNG, GIF, or WebP images are allowed"
        )
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:  # 5MB
        raise HTTPException(status_code=400, detail="Image must be under 5MB")
    if not media_type:
        media_type = "image/jpeg"
    result = await db.execute(select(PersonProfile).where(PersonProfile.person_id == person.id))
    profile = result.scalar_one_or_none()
    if not profile:
        profile = PersonProfile(person_id=person.id)
        db.add(profile)
        await db.flush()
    profile.profile_photo = content
    profile.profile_photo_media_type = media_type
    profile.profile_photo_url = (
        "/me/bio/photo"  # Sentinel: blob exists, frontend fetches with Bearer
    )
    await bump_english_content_version(db, person.id)


async def get_profile_photo_from_db(
    db: AsyncSession,
    person_id: str,
) -> tuple[bytes, str] | None:
    """Return (image_bytes, media_type) for the profile photo if stored in DB, else None."""
    result = await db.execute(
        select(PersonProfile.profile_photo, PersonProfile.profile_photo_media_type).where(
            PersonProfile.person_id == person_id
        )
    )
    row = result.one_or_none()
    if not row or row[0] is None:
        return None
    media_type = (row[1] or "image/jpeg").strip() or "image/jpeg"
    return (bytes(row[0]), media_type)


async def get_bio_response(db: AsyncSession, person: Person) -> BioResponse:
    result = await db.execute(select(PersonProfile).where(PersonProfile.person_id == person.id))
    profile = result.scalar_one_or_none()
    return bio_response_from_profile(person, profile)


async def update_bio(
    db: AsyncSession,
    person: Person,
    body: BioCreateUpdate,
) -> BioResponse:
    # Determine if we need to translate
    language = getattr(body, "language", "en") or "en"
    should_translate = language.lower() not in ("en", "english")

    # Helper to translate a single field
    async def tr(text: str | None) -> str | None:
        if not text or not should_translate:
            return text
        from src.services.translation import to_english

        return await to_english(text, language, db)

    result = await db.execute(select(PersonProfile).where(PersonProfile.person_id == person.id))
    profile = result.scalar_one_or_none()
    if not profile:
        profile = PersonProfile(person_id=person.id)
        db.add(profile)
        await db.flush()
    if body.first_name is not None:
        profile.first_name = await tr(body.first_name)
    if body.last_name is not None:
        profile.last_name = await tr(body.last_name)
    if body.date_of_birth is not None:
        profile.date_of_birth = body.date_of_birth
    if body.current_city is not None:
        profile.current_city = await tr(body.current_city)
    # profile_photo_url in body is ignored; upload sets it via /me/bio/photo endpoint
    if body.school is not None:
        profile.school = await tr(body.school)
    if body.college is not None:
        profile.college = await tr(body.college)
    if body.current_company is not None:
        profile.current_company = await tr(body.current_company)
    if body.past_companies is not None:
        profile.past_companies = [
            {
                "company_name": await tr(p.company_name) if p.company_name else "",
                "role": await tr(p.role) if p.role else None,
                "years": p.years,
            }
            for p in body.past_companies
        ]
    if body.email is not None and body.email.strip():
        new_email = body.email.strip()
        if new_email != person.email:
            existing = await db.execute(
                select(Person).where(Person.email == new_email, Person.id != person.id)
            )
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Email already registered")
            person.email = new_email
            db.add(person)
    if body.first_name is not None or body.last_name is not None:
        parts = [profile.first_name or "", profile.last_name or ""]
        person.display_name = " ".join(parts).strip() or person.display_name
        db.add(person)
    if body.linkedin_url is not None:
        profile.linkedin_url = body.linkedin_url
    if body.phone is not None:
        profile.phone = body.phone
    past = _past_companies_to_items(profile.past_companies)
    complete = bool((profile.school or "").strip() and (person.email or "").strip())
    has_photo = profile.profile_photo is not None
    await bump_english_content_version(db, person.id)
    return BioResponse(
        first_name=profile.first_name,
        last_name=profile.last_name,
        date_of_birth=profile.date_of_birth,
        current_city=profile.current_city,
        profile_photo_url="/me/bio/photo" if has_photo else None,
        school=profile.school,
        college=profile.college,
        current_company=profile.current_company,
        past_companies=past,
        email=person.email,
        linkedin_url=profile.linkedin_url,
        phone=profile.phone,
        complete=complete,
    )


async def _get_profile_schema_with_locale(db: AsyncSession, person: Person) -> PersonSchema:
    result = await db.execute(select(PersonProfile).where(PersonProfile.person_id == person.id))
    profile = result.scalar_one_or_none()
    pack = await get_or_build_localized_pack(db, person, profile)
    if pack:
        return PersonSchema.model_validate(pack["person_schema"])
    return person_to_person_schema(person, profile=profile)


async def _get_bio_with_locale(db: AsyncSession, person: Person) -> BioResponse:
    result = await db.execute(select(PersonProfile).where(PersonProfile.person_id == person.id))
    profile = result.scalar_one_or_none()
    pack = await get_or_build_localized_pack(db, person, profile)
    if pack:
        return BioResponse.model_validate(pack["bio"])
    return await get_bio_response(db, person)


async def _list_experience_cards_with_locale(db: AsyncSession, person: Person) -> list[ExperienceCardResponse]:
    result = await db.execute(select(PersonProfile).where(PersonProfile.person_id == person.id))
    profile = result.scalar_one_or_none()
    pack = await get_or_build_localized_pack(db, person, profile)
    if pack:
        return [ExperienceCardResponse.model_validate(p) for p in pack["cards_response"]]
    cards = await experience_card_service.list_cards(db, person.id)
    return [experience_card_to_response(c) for c in cards]


async def _list_experience_card_families_with_locale(
    db: AsyncSession, person: Person
) -> list[CardFamilyResponse]:
    result = await db.execute(select(PersonProfile).where(PersonProfile.person_id == person.id))
    profile = result.scalar_one_or_none()
    pack = await get_or_build_localized_pack(db, person, profile)
    if pack:
        out: list[CardFamilyResponse] = []
        for fam in pack["card_families"]:
            out.append(
                CardFamilyResponse(
                    parent=ExperienceCardResponse.model_validate(fam["parent"]),
                    children=[
                        ExperienceCardChildResponse.model_validate(c) for c in fam["children"]
                    ],
                )
            )
        return out
    families = await experience_card_service.list_card_families(db, person.id)
    return [
        CardFamilyResponse(
            parent=experience_card_to_response(parent),
            children=[experience_card_child_to_response(c) for c in children],
        )
        for parent, children in families
    ]


async def _list_experience_cards_schema_with_locale(
    db: AsyncSession, person: Person
) -> list[ExperienceCardSchema]:
    result = await db.execute(select(PersonProfile).where(PersonProfile.person_id == person.id))
    profile = result.scalar_one_or_none()
    pack = await get_or_build_localized_pack(db, person, profile)
    if pack:
        return [ExperienceCardSchema.model_validate(s) for s in pack["cards_schema"]]
    cards = await experience_card_service.list_cards(db, person.id)
    return [experience_card_to_schema(c) for c in cards]


async def _get_credits(db: AsyncSession, person_id: str) -> CreditsResponse:
    result = await db.execute(select(PersonProfile).where(PersonProfile.person_id == person_id))
    profile = result.scalar_one_or_none()
    if not profile:
        return CreditsResponse(balance=0)
    return CreditsResponse(balance=profile.balance)


async def _purchase_credits(
    db: AsyncSession,
    person_id: str,
    body: PurchaseCreditsRequest,
) -> CreditsResponse:
    if body.credits < 1:
        raise HTTPException(status_code=400, detail="credits must be at least 1")
    if body.credits > 100_000:
        raise HTTPException(status_code=400, detail="credits per purchase limited to 100,000")
    new_balance = await add_credits_to_wallet(db, person_id, body.credits, reason="purchase")
    return CreditsResponse(balance=new_balance)


async def _get_credits_ledger(db: AsyncSession, person_id: str) -> list[LedgerEntryResponse]:
    result = await db.execute(
        select(CreditLedger)
        .where(CreditLedger.person_id == person_id)
        .order_by(CreditLedger.created_at.desc())
    )
    entries = result.scalars().all()
    return [
        LedgerEntryResponse(
            id=e.id,
            amount=e.amount,
            reason=e.reason,
            reference_type=e.reference_type,
            reference_id=str(e.reference_id) if e.reference_id else None,
            balance_after=e.balance_after,
            created_at=e.created_at,
        )
        for e in entries
    ]


def _contact_response(
    p: PersonProfile | None, *, email: str | None = None
) -> ContactDetailsResponse:
    if not p:
        return ContactDetailsResponse(
            email_visible=True,
            email=email,
            phone=None,
            linkedin_url=None,
            other=None,
        )
    return ContactDetailsResponse(
        email_visible=p.email_visible,
        email=email if p.email_visible else None,
        phone=p.phone,
        linkedin_url=p.linkedin_url,
        other=p.other,
    )


async def get_contact_response(db: AsyncSession, person_id: str) -> ContactDetailsResponse:
    person_result = await db.execute(select(Person).where(Person.id == person_id))
    person = person_result.scalar_one_or_none()
    result = await db.execute(select(PersonProfile).where(PersonProfile.person_id == person_id))
    profile = result.scalar_one_or_none()
    return _contact_response(profile, email=person.email if person else None)


async def update_contact(
    db: AsyncSession,
    person_id: str,
    body: PatchContactRequest,
) -> ContactDetailsResponse:
    result = await db.execute(select(PersonProfile).where(PersonProfile.person_id == person_id))
    profile = result.scalar_one_or_none()
    if not profile:
        profile = PersonProfile(person_id=person_id)
        db.add(profile)
        await db.flush()
    if body.email_visible is not None:
        profile.email_visible = body.email_visible
    if body.phone is not None:
        profile.phone = body.phone
    if body.linkedin_url is not None:
        profile.linkedin_url = body.linkedin_url
    if body.other is not None:
        profile.other = body.other
    person_result = await db.execute(select(Person).where(Person.id == person_id))
    person = person_result.scalar_one_or_none()
    return _contact_response(profile, email=person.email if person else None)


class ProfileService:
    """Facade for profile (visibility, bio, credits, contact) operations."""

    @staticmethod
    async def get_current_user(person: Person) -> PersonResponse:
        return await get_profile(person)

    @staticmethod
    async def get_profile_schema(db: AsyncSession, person: Person) -> PersonSchema:
        return await _get_profile_schema_with_locale(db, person)

    @staticmethod
    async def patch_current_user(
        db: AsyncSession, person: Person, body: PatchProfileRequest
    ) -> PersonResponse:
        return await update_profile(db, person, body)

    @staticmethod
    async def get_visibility(db: AsyncSession, person_id: str) -> VisibilitySettingsResponse:
        return await _get_visibility(db, person_id)

    @staticmethod
    async def patch_visibility(
        db: AsyncSession,
        person_id: str,
        body: PatchVisibilityRequest,
    ) -> VisibilitySettingsResponse:
        return await _patch_visibility(db, person_id, body)

    @staticmethod
    async def get_bio(db: AsyncSession, person: Person) -> BioResponse:
        return await _get_bio_with_locale(db, person)

    @staticmethod
    async def put_bio(
        db: AsyncSession,
        person: Person,
        body: BioCreateUpdate,
    ) -> BioResponse:
        return await update_bio(db, person, body)

    upload_profile_photo = staticmethod(upload_profile_photo)
    get_profile_photo_from_db = staticmethod(get_profile_photo_from_db)

    @staticmethod
    async def get_credits(db: AsyncSession, person_id: str) -> CreditsResponse:
        return await _get_credits(db, person_id)

    @staticmethod
    async def purchase_credits(
        db: AsyncSession,
        person_id: str,
        body: PurchaseCreditsRequest,
    ) -> CreditsResponse:
        return await _purchase_credits(db, person_id, body)

    @staticmethod
    async def get_credits_ledger(db: AsyncSession, person_id: str) -> list[LedgerEntryResponse]:
        return await _get_credits_ledger(db, person_id)

    @staticmethod
    async def list_experience_cards(db: AsyncSession, person: Person) -> list[ExperienceCardResponse]:
        return await _list_experience_cards_with_locale(db, person)

    @staticmethod
    async def list_experience_card_families(
        db: AsyncSession, person: Person
    ) -> list[CardFamilyResponse]:
        return await _list_experience_card_families_with_locale(db, person)

    @staticmethod
    async def list_experience_cards_schema(
        db: AsyncSession, person: Person
    ) -> list[ExperienceCardSchema]:
        return await _list_experience_cards_schema_with_locale(db, person)

    @staticmethod
    async def get_contact(db: AsyncSession, person_id: str) -> ContactDetailsResponse:
        return await get_contact_response(db, person_id)

    @staticmethod
    async def patch_contact(
        db: AsyncSession,
        person_id: str,
        body: PatchContactRequest,
    ) -> ContactDetailsResponse:
        return await update_contact(db, person_id, body)


profile_service = ProfileService()
