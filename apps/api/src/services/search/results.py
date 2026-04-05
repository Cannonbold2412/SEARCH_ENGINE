"""Search result building and persistence.

Extracted from search_logic.py. Responsible for:
- PendingSearchRow dataclass
- Building PersonSearchResult lists
- Preparing and persisting SearchResult DB rows
- Loading child-only cards, people, and profiles
- Helpers: headline, bio, photo URL, card families
"""

from __future__ import annotations

import logging
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core import SEARCH_NEVER_EXPIRES
from src.db.models import (
    ExperienceCard,
    ExperienceCardChild,
    Person,
    PersonProfile,
    Search,
    SearchResult,
)
from src.schemas import PersonSearchResult, SearchResponse
from src.schemas.builder import CardFamilyResponse
from src.schemas.search import ParsedConstraintsPayload
from src.serializers import experience_card_child_to_response, experience_card_to_response
from src.services.credits import deduct_credits, save_idempotent_response

from ._runtime_values import attr_bool, attr_decimal, attr_nonempty_str, attr_str, attr_str_list
from .graph_view import PersonGraphFeatures, build_graph_features_dict
from .scoring import (
    MATCHED_CARDS_PER_PERSON,
    _score_to_similarity_percent,
)
from .why_matched import (
    _FALLBACK_WHY_MATCHED,
    _build_person_why_evidence,
    build_match_explanation_payload,
    fallback_build_why_matched,
)

logger = logging.getLogger(__name__)

SEARCH_ENDPOINT = "POST /search"


# -----------------------------------------------------------------------------
# Dataclasses
# -----------------------------------------------------------------------------
@dataclass(frozen=True)
class _PendingSearchRow:
    """Prepared SearchResult payload before why_matched resolution."""

    person_id: str
    rank: int
    score: float
    matched_parent_ids: list[str]
    matched_child_ids: list[str]
    fallback_why: list[str]


# -----------------------------------------------------------------------------
# Person display helpers
# -----------------------------------------------------------------------------
def _build_person_headline(profile: PersonProfile | None) -> str | None:
    """Build short headline from current company and city."""
    if not profile:
        return None
    parts = [
        part
        for part in (
            attr_nonempty_str(profile, "current_company"),
            attr_nonempty_str(profile, "current_city"),
        )
        if part
    ]
    return " / ".join(parts) if parts else None


def _build_person_bio(profile: PersonProfile | None) -> str | None:
    """Build compact bio summary used in search cards."""
    if not profile:
        return None
    bio_parts: list[str] = []
    full_name = " ".join(
        part
        for part in (
            attr_nonempty_str(profile, "first_name"),
            attr_nonempty_str(profile, "last_name"),
        )
        if part
    ).strip()
    if full_name:
        bio_parts.append(full_name)
    school = attr_nonempty_str(profile, "school")
    if school:
        bio_parts.append(f"School: {school}")
    college = attr_nonempty_str(profile, "college")
    if college:
        bio_parts.append(f"College: {college}")
    return " | ".join(bio_parts) if bio_parts else None


def _build_search_profile_photo_url(person_id: str, profile: PersonProfile | None) -> str | None:
    """Return a public profile photo URL for search cards when available."""
    if not profile:
        return None
    if getattr(profile, "profile_photo", None) is not None:
        return f"/people/{person_id}/photo"
    raw_url = attr_nonempty_str(profile, "profile_photo_url") or ""
    if raw_url and not raw_url.startswith("/me/"):
        return raw_url
    return None


def _card_families_from_parents_and_children(
    parents: Sequence[ExperienceCard],
    children_list: Sequence[ExperienceCardChild],
) -> list[CardFamilyResponse]:
    """Build CardFamilyResponse list from parent cards and their children."""
    by_parent: dict[str, list[ExperienceCardChild]] = defaultdict(list)
    for ch in children_list:
        by_parent[str(ch.parent_experience_id)].append(ch)
    return [
        CardFamilyResponse(
            parent=experience_card_to_response(card),
            children=[
                experience_card_child_to_response(ch) for ch in by_parent.get(str(card.id), [])
            ],
        )
        for card in parents
    ]


# -----------------------------------------------------------------------------
# Search record management
# -----------------------------------------------------------------------------
async def _create_search_record(
    db: AsyncSession,
    searcher_id: str,
    query_text: str | None,
    filters_dict: dict[str, Any],
    fallback_tier: int | None,
) -> Search:
    """Insert Search row and return the flushed ORM object."""
    search_rec = Search(
        searcher_id=searcher_id,
        query_text=query_text,
        parsed_constraints_json=filters_dict,
        extra={"fallback_tier": fallback_tier} if fallback_tier is not None else None,
        expires_at=SEARCH_NEVER_EXPIRES,
    )
    db.add(search_rec)
    await db.flush()
    return search_rec


async def _create_empty_search_response(
    db: AsyncSession,
    searcher_id: str,
    body: Any,
    filters_dict: dict,
    idempotency_key: str | None,
    *,
    fallback_tier: int | None = None,
    num_cards: int | None = None,
    saved_query_text: str | None = None,
) -> SearchResponse:
    """Create Search record, return empty SearchResponse (no credit deduction)."""
    query_for_history = (
        saved_query_text if saved_query_text is not None else getattr(body, "query", None) or ""
    )
    search_rec = await _create_search_record(
        db=db,
        searcher_id=searcher_id,
        query_text=query_for_history,
        filters_dict=filters_dict,
        fallback_tier=fallback_tier,
    )
    resp = SearchResponse(search_id=str(search_rec.id), people=[], num_cards=num_cards)
    if idempotency_key:
        await save_idempotent_response(
            db,
            idempotency_key,
            searcher_id,
            SEARCH_ENDPOINT,
            200,
            resp.model_dump(mode="json"),
        )
    return resp


async def _deduct_search_credits_or_raise(
    db: AsyncSession, searcher_id: str, search_id: str, amount: int
) -> None:
    """Deduct amount search credits (1 per card shown) or raise 402."""
    if amount <= 0:
        return
    if not await deduct_credits(db, searcher_id, amount, "search", "search_id", search_id):
        raise HTTPException(status_code=402, detail="Insufficient credits")


# -----------------------------------------------------------------------------
# Person list and ranking helpers
# -----------------------------------------------------------------------------
def _select_matched_parent_ids(
    parent_list: list[tuple[ExperienceCard, float]],
    child_best_parents: list[str],
) -> list[str]:
    """Prefer the parent linked to best child evidence, then fill with best parent matches."""
    if parent_list:
        base_parent_ids = [str(card.id) for card, _ in parent_list[:MATCHED_CARDS_PER_PERSON]]
        if child_best_parents:
            best_child_parent_id = child_best_parents[0]
            others = [pid for pid in base_parent_ids if pid != best_child_parent_id]
            return [best_child_parent_id] + others[: MATCHED_CARDS_PER_PERSON - 1]
        return base_parent_ids
    return child_best_parents[:MATCHED_CARDS_PER_PERSON]


def _build_search_people_list(
    ranked_people: list[tuple[str, float]],
    people_map: dict[str, Person],
    vis_map: dict[str, PersonProfile],
    person_cards: dict[str, list[tuple[ExperienceCard, float]]],
    child_only_cards: dict[str, list[ExperienceCard]],
    similarity_by_person: dict[str, int],
    why_matched_by_person: dict[str, list[str]],
) -> list[PersonSearchResult]:
    """Build PersonSearchResult list for search response from top-ranked persons and their best cards."""
    people_list = []
    for pid, _score in ranked_people:
        person = people_map.get(pid)
        vis = vis_map.get(pid)
        card_list = person_cards.get(pid, [])
        best_cards = [c for c, _ in card_list[:MATCHED_CARDS_PER_PERSON]]
        if not best_cards and pid in child_only_cards:
            best_cards = child_only_cards[pid][:MATCHED_CARDS_PER_PERSON]
        people_list.append(
            PersonSearchResult(
                id=pid,
                name=attr_str(person, "display_name") if person else None,
                headline=_build_person_headline(vis),
                bio=_build_person_bio(vis),
                profile_photo_url=_build_search_profile_photo_url(pid, vis),
                similarity_percent=similarity_by_person.get(pid),
                why_matched=why_matched_by_person.get(pid, []),
                open_to_work=attr_bool(vis, "open_to_work") if vis else False,
                open_to_contact=attr_bool(vis, "open_to_contact") if vis else False,
                work_preferred_locations=attr_str_list(vis, "work_preferred_locations")
                if vis
                else [],
                work_preferred_salary_min=attr_decimal(vis, "work_preferred_salary_min")
                if vis
                else None,
                matched_cards=[experience_card_to_response(c) for c in best_cards],
            )
        )
    return people_list


def _prepare_pending_search_rows(
    ranked_people: list[tuple[str, float]],
    person_cards: dict[str, list[tuple[ExperienceCard, float]]],
    child_sims_by_person: dict[str, list[tuple[str, str, float]]],
    child_best_parent_ids: dict[str, list[str]],
    children_by_id: dict[str, ExperienceCardChild],
    vis_map: dict[str, PersonProfile],
    payload: ParsedConstraintsPayload | None = None,
) -> tuple[dict[str, int], list[_PendingSearchRow], list[dict[str, Any]]]:
    """Prepare similarity, DB row payloads, and LLM evidence from ranked people."""
    similarity_by_person: dict[str, int] = {}
    pending_search_rows: list[_PendingSearchRow] = []
    llm_people_evidence: list[dict[str, Any]] = []
    row_data: list[tuple[str, int, float, list[str], list[str]]] = []

    for rank, (person_id, score) in enumerate(ranked_people, 1):
        parent_list = person_cards.get(person_id, [])
        child_list = child_sims_by_person.get(person_id, [])
        matched_parent_ids = _select_matched_parent_ids(
            parent_list, child_best_parent_ids.get(person_id) or []
        )
        matched_child_ids = [
            child_id
            for _parent_id, child_id, _sim in child_list[:MATCHED_CARDS_PER_PERSON]
            if child_id
        ]
        parent_cards_for_bullets = parent_list[:MATCHED_CARDS_PER_PERSON]
        child_evidence_for_bullets = [
            (children_by_id[child_id], parent_id, sim)
            for parent_id, child_id, sim in child_list[:MATCHED_CARDS_PER_PERSON]
            if child_id and child_id in children_by_id
        ]
        llm_people_evidence.append(
            _build_person_why_evidence(
                person_id=person_id,
                profile=vis_map.get(person_id),
                parent_cards_with_sim=parent_cards_for_bullets,
                child_evidence=child_evidence_for_bullets,
            )
        )
        similarity_by_person[person_id] = _score_to_similarity_percent(score)
        row_data.append((person_id, rank, score, matched_parent_ids, matched_child_ids))

    query_context: dict[str, Any] = {}
    if payload:
        query_context = {
            "query_original": payload.query_original or "",
            "query_cleaned": payload.query_cleaned or payload.query_original or "",
            "must": payload.must.model_dump(mode="json"),
            "should": payload.should.model_dump(mode="json"),
        }
    cleaned_payloads = build_match_explanation_payload(query_context, llm_people_evidence)
    by_person_cleaned = {p["person_id"]: p for p in cleaned_payloads}
    generic_fallback = [_FALLBACK_WHY_MATCHED]
    for person_id, rank, score, matched_parent_ids, matched_child_ids in row_data:
        item = by_person_cleaned.get(person_id)
        fallback_why = generic_fallback
        if item:
            reasons = fallback_build_why_matched(item, item.get("query_context") or query_context)
            if reasons:
                fallback_why = reasons
        pending_search_rows.append(
            _PendingSearchRow(
                person_id=person_id,
                rank=rank,
                score=score,
                matched_parent_ids=matched_parent_ids,
                matched_child_ids=matched_child_ids,
                fallback_why=fallback_why,
            )
        )

    return similarity_by_person, pending_search_rows, llm_people_evidence


def _persist_search_results(
    db: AsyncSession,
    search_id: Any,
    pending_search_rows: list[_PendingSearchRow],
    llm_why_by_person: dict[str, list[str]],
    graph_features_map: dict[str, PersonGraphFeatures] | None = None,
) -> dict[str, list[str]]:
    """Insert SearchResult rows and return resolved why_matched per person."""
    why_matched_by_person: dict[str, list[str]] = {}
    to_add: list[SearchResult] = []
    for row in pending_search_rows:
        why_matched = llm_why_by_person.get(row.person_id) or row.fallback_why
        why_matched_by_person[row.person_id] = why_matched
        extra: dict[str, Any] = {
            "matched_parent_ids": row.matched_parent_ids,
            "matched_child_ids": row.matched_child_ids,
            "why_matched": why_matched,
        }
        if graph_features_map and row.person_id in graph_features_map:
            extra["graph_features"] = build_graph_features_dict(graph_features_map[row.person_id])
        to_add.append(
            SearchResult(
                search_id=search_id,
                person_id=row.person_id,
                rank=row.rank,
                score=Decimal(str(round(row.score, 6))),
                extra=extra,
            )
        )
    db.add_all(to_add)
    return why_matched_by_person


# -----------------------------------------------------------------------------
# Data loading helpers
# -----------------------------------------------------------------------------
async def _load_child_evidence_map(
    db: AsyncSession,
    child_evidence_rows: list,
) -> dict[str, ExperienceCardChild]:
    """Load child objects used for why_matched evidence payloads."""
    child_ids = [str(r.child_id) for r in child_evidence_rows if getattr(r, "child_id", None)]
    if not child_ids:
        return {}
    deduped_child_ids = list(dict.fromkeys(child_ids))
    child_objs = (
        (
            await db.execute(
                select(ExperienceCardChild).where(ExperienceCardChild.id.in_(deduped_child_ids))
            )
        )
        .scalars()
        .all()
    )
    return {str(c.id): c for c in child_objs}


async def _load_people_profiles_and_children(
    db: AsyncSession,
    person_ids: list[str],
    child_evidence_rows: list,
    preloaded_children: dict[str, ExperienceCardChild] | None = None,
) -> tuple[dict[str, Person], dict[str, PersonProfile], dict[str, ExperienceCardChild]]:
    """Load Person, PersonProfile, and child-evidence objects for the ranked people set."""
    if preloaded_children is not None:
        people_result = await db.execute(select(Person).where(Person.id.in_(person_ids)))
        profiles_result = await db.execute(
            select(PersonProfile).where(PersonProfile.person_id.in_(person_ids))
        )
        children_by_id = preloaded_children
    else:
        people_result = await db.execute(select(Person).where(Person.id.in_(person_ids)))
        profiles_result = await db.execute(
            select(PersonProfile).where(PersonProfile.person_id.in_(person_ids))
        )
        children_by_id = await _load_child_evidence_map(db, child_evidence_rows)
    people_map = {str(person.id): person for person in people_result.scalars().all()}
    profiles_map = {str(profile.person_id): profile for profile in profiles_result.scalars().all()}
    return people_map, profiles_map, children_by_id


async def _load_child_only_cards(
    db: AsyncSession,
    pid_list: list[str],
    person_cards: dict[str, list[tuple[ExperienceCard, float]]],
    child_best_parent_ids: dict[str, list[str]],
) -> dict[str, list[ExperienceCard]]:
    """Load display cards for people matched only via child embeddings."""
    child_only_pids = [pid for pid in pid_list if pid not in person_cards]
    child_only_cards: dict[str, list[ExperienceCard]] = {}
    if not child_only_pids:
        return child_only_cards

    parent_ids_to_load: list[str] = []
    pid_to_ordered_parent_ids: dict[str, list[str]] = {}
    for pid in child_only_pids:
        ordered = child_best_parent_ids.get(pid)
        if ordered:
            pid_to_ordered_parent_ids[pid] = ordered
            parent_ids_to_load.extend(ordered)

    if parent_ids_to_load:
        parent_ids_to_load = list(dict.fromkeys(parent_ids_to_load))
        stmt_matched = select(ExperienceCard).where(
            ExperienceCard.id.in_(parent_ids_to_load),
            ExperienceCard.experience_card_visibility,
        )
        matched_cards_by_id = {
            str(c.id): c for c in (await db.execute(stmt_matched)).scalars().all()
        }
        for pid in child_only_pids:
            ordered_ids = pid_to_ordered_parent_ids.get(pid, [])
            child_only_cards[pid] = []
            for card_id in ordered_ids:
                if (
                    card_id in matched_cards_by_id
                    and len(child_only_cards[pid]) < MATCHED_CARDS_PER_PERSON
                ):
                    child_only_cards[pid].append(matched_cards_by_id[card_id])

    fallback_pids = [
        pid for pid in child_only_pids if pid not in child_only_cards or not child_only_cards[pid]
    ]
    if fallback_pids:
        fallback_stmt = (
            select(ExperienceCard)
            .where(
                ExperienceCard.person_id.in_(fallback_pids),
                ExperienceCard.experience_card_visibility,
            )
            .order_by(ExperienceCard.person_id, ExperienceCard.created_at.desc())
        )
        fallback_rows = (await db.execute(fallback_stmt)).scalars().all()
        for card in fallback_rows:
            pid = str(card.person_id)
            if len(child_only_cards.get(pid, [])) < MATCHED_CARDS_PER_PERSON:
                child_only_cards.setdefault(pid, []).append(card)

    return child_only_cards
