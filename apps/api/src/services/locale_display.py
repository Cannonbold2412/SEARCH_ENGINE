"""Persisted localized snapshots for /me profile + experience cards.

When ``preferred_language`` is not English, we translate once, store a JSON blob
on ``PersonProfile.localized_ui_cache``, and reuse it until either the language
changes or ``english_content_version`` is bumped (bio/cards/visibility updates).

Per-string Sarvam calls still dedupe via ``translation_cache``; this layer avoids
re-walking the graph on every login.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import Person, PersonProfile
from src.domain import ExperienceCardSchema, PersonSchema
from src.schemas import (
    BioResponse,
    CardFamilyResponse,
    ExperienceCardChildResponse,
    ExperienceCardResponse,
)
from src.schemas.discover import PersonListItem, UnlockedCardItem
from src.schemas.search import PersonProfileResponse, PersonSearchResult
from src.serializers import (
    experience_card_child_to_response,
    experience_card_to_response,
    experience_card_to_schema,
    person_to_person_schema,
)
from src.services.experience import experience_card_service
from src.services.profile_bio import bio_response_from_profile
from src.services.translation import batch_from_english, from_english

logger = logging.getLogger(__name__)


async def bump_english_content_version(db: AsyncSession, person_id: str) -> None:
    """Invalidate localized UI by incrementing the English content revision."""
    result = await db.execute(select(PersonProfile).where(PersonProfile.person_id == person_id))
    profile = result.scalar_one_or_none()
    if not profile:
        return
    profile.english_content_version = int(profile.english_content_version or 0) + 1
    profile.localized_ui_cache = None


def _cache_hit(profile: PersonProfile, lang: str) -> dict[str, Any] | None:
    raw = profile.localized_ui_cache
    if not isinstance(raw, dict):
        return None
    ver = int(profile.english_content_version or 0)
    if raw.get("lang") == lang and int(raw.get("content_version", -1)) == ver:
        # Rebuild if cached before cards_response was added to the pack shape
        if not raw.get("cards_response"):
            return None
        return raw
    return None


async def _t(db: AsyncSession, text: str | None, lang: str) -> str | None:
    if not text or not str(text).strip():
        return text
    return await from_english(str(text), lang, db)


async def _translate_person_schema(
    schema: PersonSchema, lang: str, db: AsyncSession
) -> dict[str, Any]:
    d = schema.model_dump(mode="json")
    if d.get("display_name"):
        d["display_name"] = await _t(db, d["display_name"], lang) or ""
    loc = d.get("location") or {}
    if loc.get("city"):
        loc["city"] = await _t(db, loc["city"], lang)
        d["location"] = loc
    return d


async def _translate_bio(bio: BioResponse, lang: str, db: AsyncSession) -> dict[str, Any]:
    d = bio.model_dump(mode="json")
    for key in (
        "first_name",
        "last_name",
        "current_city",
        "school",
        "college",
        "current_company",
    ):
        if d.get(key):
            d[key] = await _t(db, str(d[key]), lang)
    past = d.get("past_companies")
    if isinstance(past, list):
        for p in past:
            if not isinstance(p, dict):
                continue
            if p.get("company_name"):
                p["company_name"] = await _t(db, str(p["company_name"]), lang)
            if p.get("role"):
                p["role"] = await _t(db, str(p["role"]), lang)
    return d


async def _translate_card_response(
    card: ExperienceCardResponse, lang: str, db: AsyncSession
) -> dict[str, Any]:
    d = card.model_dump(mode="json")
    for key in (
        "title",
        "normalized_role",
        "domain",
        "sub_domain",
        "company_name",
        "company_type",
        "team",
        "location",
        "summary",
        "raw_text",
        "employment_type",
        "intent_primary",
        "seniority_level",
    ):
        if d.get(key):
            d[key] = await _t(db, str(d[key]), lang)
    sec = d.get("intent_secondary")
    if isinstance(sec, list) and sec:
        d["intent_secondary"] = [(await _t(db, str(x), lang) if x else x) for x in sec]
    return d


async def _translate_child_response(
    child: ExperienceCardChildResponse, lang: str, db: AsyncSession
) -> dict[str, Any]:
    d = child.model_dump(mode="json")
    for it in d.get("items") or []:
        if not isinstance(it, dict):
            continue
        if it.get("title"):
            it["title"] = await _t(db, str(it["title"]), lang)
        if it.get("description"):
            it["description"] = await _t(db, str(it["description"]), lang)
    return d


async def _translate_card_schema(
    schema: ExperienceCardSchema, lang: str, db: AsyncSession
) -> dict[str, Any]:
    d = schema.model_dump(mode="json")
    if d.get("headline"):
        d["headline"] = await _t(db, str(d["headline"]), lang)
    if d.get("summary"):
        d["summary"] = await _t(db, str(d["summary"]), lang)
    if d.get("raw_text"):
        d["raw_text"] = await _t(db, str(d["raw_text"]), lang)
    loc = d.get("location") or {}
    if isinstance(loc, dict) and loc.get("text"):
        loc["text"] = await _t(db, str(loc["text"]), lang)
        d["location"] = loc
    for r in d.get("roles") or []:
        if isinstance(r, dict) and r.get("label"):
            r["label"] = await _t(db, str(r["label"]), lang)
    qual = d.get("quality")
    if isinstance(qual, dict) and qual.get("clarifying_question"):
        qual["clarifying_question"] = await _t(db, str(qual["clarifying_question"]), lang)
        d["quality"] = qual
    return d


async def get_or_build_localized_pack(
    db: AsyncSession,
    person: Person,
    profile: PersonProfile | None,
) -> dict[str, Any] | None:
    """
    Return cached or freshly built localized payload for ``person``.

    Returns ``None`` when UI should stay in English (no profile or ``en``).
    """
    if profile is None:
        return None
    lang = (profile.preferred_language or "en").lower()
    if lang in ("en", "english"):
        return None

    hit = _cache_hit(profile, lang)
    if hit:
        return hit

    ver = int(profile.english_content_version or 0)
    try:
        person_schema_en = person_to_person_schema(person, profile=profile)
        bio_en = bio_response_from_profile(person, profile)
        cards = await experience_card_service.list_cards(db, person.id)
        families = await experience_card_service.list_card_families(db, person.id)

        person_dict = await _translate_person_schema(person_schema_en, lang, db)
        bio_dict = await _translate_bio(bio_en, lang, db)
        cards_schema_dicts: list[dict[str, Any]] = []
        for c in cards:
            sch = experience_card_to_schema(c)
            cards_schema_dicts.append(await _translate_card_schema(sch, lang, db))

        fam_dicts: list[dict[str, Any]] = []
        for parent, children in families:
            p_dict = await _translate_card_response(experience_card_to_response(parent), lang, db)
            ch_list = [
                await _translate_child_response(experience_card_child_to_response(ch), lang, db)
                for ch in children
            ]
            fam_dicts.append({"parent": p_dict, "children": ch_list})

        cards_response_dicts: list[dict[str, Any]] = [
            await _translate_card_response(experience_card_to_response(c), lang, db) for c in cards
        ]

        pack: dict[str, Any] = {
            "lang": lang,
            "content_version": ver,
            "person_schema": person_dict,
            "bio": bio_dict,
            "cards_schema": cards_schema_dicts,
            "cards_response": cards_response_dicts,
            "card_families": fam_dicts,
        }
        profile.localized_ui_cache = pack
        await db.flush()
        return pack
    except Exception:
        logger.exception("Failed to build localized UI pack for person_id=%s", person.id)
        raise


async def localize_person_search_results_for_viewer(
    db: AsyncSession,
    people: list[PersonSearchResult],
    lang: str,
) -> None:
    """Translate search result rows (cards, snippets, why_matched) into the viewer's language.

    English source is stored in the DB; this uses the same field set as owner localized packs.
    Mutates ``people`` in place.
    """
    code = (lang or "en").lower()
    if code in ("en", "english") or not people:
        return

    for p in people:
        if p.name:
            p.name = await _t(db, p.name, code) or p.name
        if p.headline:
            p.headline = await _t(db, p.headline, code) or p.headline
        if p.bio:
            p.bio = await _t(db, p.bio, code) or p.bio
        if p.work_preferred_locations:
            p.work_preferred_locations = [
                (await _t(db, loc, code) or loc) for loc in p.work_preferred_locations
            ]
        if p.matched_cards:
            translated: list[ExperienceCardResponse] = []
            for c in p.matched_cards:
                d = await _translate_card_response(c, code, db)
                translated.append(ExperienceCardResponse.model_validate(d))
            p.matched_cards = translated
        if p.why_matched:
            p.why_matched = await batch_from_english(list(p.why_matched), code, db)


async def localize_person_profile_response_for_viewer(
    db: AsyncSession,
    profile: PersonProfileResponse,
    lang: str,
) -> None:
    """Translate another user's profile payload for the viewer's language (mutates in place)."""
    code = (lang or "en").lower()
    if code in ("en", "english"):
        return

    if profile.display_name:
        profile.display_name = (await _t(db, profile.display_name, code)) or profile.display_name
    if profile.work_preferred_locations:
        profile.work_preferred_locations = [
            (await _t(db, loc, code) or loc) for loc in profile.work_preferred_locations
        ]
    if profile.bio:
        bio_d = await _translate_bio(profile.bio, code, db)
        profile.bio = BioResponse.model_validate(bio_d)
    if profile.experience_cards:
        profile.experience_cards = [
            ExperienceCardResponse.model_validate(await _translate_card_response(c, code, db))
            for c in profile.experience_cards
        ]
    if profile.card_families:
        new_families: list[CardFamilyResponse] = []
        for fam in profile.card_families:
            p_d = await _translate_card_response(fam.parent, code, db)
            children = [
                ExperienceCardChildResponse.model_validate(
                    await _translate_child_response(ch, code, db)
                )
                for ch in fam.children
            ]
            new_families.append(
                CardFamilyResponse(
                    parent=ExperienceCardResponse.model_validate(p_d),
                    children=children,
                )
            )
        profile.card_families = new_families
    if profile.contact is not None and profile.contact.other:
        other = await _t(db, profile.contact.other, code)
        profile.contact = profile.contact.model_copy(
            update={"other": other or profile.contact.other}
        )


async def _localize_display_location_summaries_rows(
    db: AsyncSession,
    rows: list[Any],
    lang: str,
) -> None:
    """Translate display_name, current_location, and experience_summaries in place."""
    code = (lang or "en").lower()
    if code in ("en", "english") or not rows:
        return

    for item in rows:
        if item.display_name:
            item.display_name = (await _t(db, item.display_name, code)) or item.display_name
        if item.current_location:
            item.current_location = (
                await _t(db, item.current_location, code)
            ) or item.current_location

    flat: list[str] = []
    meta: list[tuple[int, int]] = []
    for pi, item in enumerate(rows):
        for sj, s in enumerate(item.experience_summaries):
            if s and str(s).strip():
                flat.append(str(s))
                meta.append((pi, sj))
    if not flat:
        return
    translated = await batch_from_english(flat, lang, db)
    new_summaries = [list(r.experience_summaries) for r in rows]
    for (pi, sj), t in zip(meta, translated, strict=True):
        new_summaries[pi][sj] = t
    for i, item in enumerate(rows):
        item.experience_summaries = new_summaries[i]


async def localize_discover_people_for_viewer(
    db: AsyncSession,
    people: list[PersonListItem],
    lang: str,
) -> None:
    """Translate explore-grid rows (name, city, experience summaries) for the viewer."""
    await _localize_display_location_summaries_rows(db, people, lang)


async def localize_unlocked_cards_for_viewer(
    db: AsyncSession,
    cards: list[UnlockedCardItem],
    lang: str,
) -> None:
    """Translate unlocked-cards list rows for the viewer."""
    await _localize_display_location_summaries_rows(db, cards, lang)
