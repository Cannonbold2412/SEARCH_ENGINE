"""Search pipeline orchestration and public API.

This module now stays thin: it coordinates the search flow and delegates
candidate generation, scoring, persistence, and why-matched explanation work
to the focused modules in this package.
"""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import UTC, datetime
from typing import Any, cast

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import ExperienceCard, Person, PersonProfile, Search, SearchResult
from src.providers import get_chat_provider
from src.schemas import (
    PersonSearchResult,
    SavedSearchesResponse,
    SavedSearchItem,
    SearchRequest,
    SearchResponse,
)
from src.schemas.search import ParsedConstraintsMust
from src.serializers import experience_card_to_response
from src.services.credits import (
    deduct_credits,
    get_balance,
    get_idempotent_response,
    save_idempotent_response,
)

from ._runtime_values import as_dict, attr_bool, attr_decimal, attr_str, attr_str_list, resolve_viewer_language
from .candidates import (
    MIN_RESULTS,
    _build_embedding_text,
    _build_query_ts,
    _collect_constraint_terms,
    _embed_query_vector,
    _fetch_candidates_lexical_only,
    _fetch_candidates_with_fallback,
    _lexical_candidates,
    _lexical_candidates_relaxed,
    _parse_search_payload,
)
from .results import (
    _build_person_bio,
    _build_person_headline,
    _build_search_people_list,
    _build_search_profile_photo_url,
    _create_empty_search_response,
    _create_search_record,
    _deduct_search_credits_or_raise,
    _load_child_evidence_map,
    _load_child_only_cards,
    _load_people_profiles_and_children,
    _persist_search_results,
    _prepare_pending_search_rows,
)
from .scoring import _apply_post_rank_tiebreakers, _collapse_and_rank_persons
from .why_matched import (
    _generate_llm_why_matched,
    _update_why_matched_async,
    boost_query_matching_reasons,
    build_match_explanation_payload,
)

logger = logging.getLogger(__name__)

SEARCH_ENDPOINT = "POST /search"
DEFAULT_NUM_CARDS = 6
TOP_PEOPLE_STORED = 24
LOAD_MORE_LIMIT = 6

_NUM_CARDS_PATTERNS = [
    re.compile(
        r"(?:give me|show me|get me|fetch me|I need|want|return)\s+(\d+)\s*(?:cards?|results?|people|profiles?)?\b",
        re.I,
    ),
    re.compile(r"\b(\d+)\s*(?:cards?|results?|people|profiles?)\b", re.I),
    re.compile(r"(?:top|first|at least)\s+(\d+)\s*(?:cards?|results?|people)?\b", re.I),
]


async def _validate_search_session(
    db: AsyncSession,
    searcher_id: str,
    search_id: str,
    person_id: str | None = None,
) -> tuple[Search, SearchResult | None]:
    """Validate search ownership and optional membership in results."""
    if person_id is not None:
        stmt = (
            select(Search)
            .join(
                SearchResult,
                (SearchResult.search_id == Search.id) & (SearchResult.person_id == person_id),
            )
            .where(Search.id == search_id, Search.searcher_id == searcher_id)
        )
        s_result = await db.execute(stmt)
        search_rec = s_result.scalar_one_or_none()
        if not search_rec:
            raise HTTPException(
                status_code=403, detail="Invalid search_id or person not in this search result"
            )
    else:
        s_result = await db.execute(
            select(Search).where(Search.id == search_id, Search.searcher_id == searcher_id)
        )
        search_rec = s_result.scalar_one_or_none()
        if not search_rec:
            raise HTTPException(status_code=403, detail="Invalid search_id")
    if _search_expired(search_rec):
        raise HTTPException(status_code=403, detail="Search expired")
    return search_rec, None


def _search_expired(search_rec: Search) -> bool:
    """Return whether a search record has expired."""
    expires_at = getattr(search_rec, "expires_at", None)
    if not expires_at:
        return False
    return expires_at < datetime.now(UTC)


def _extract_num_cards_from_query(query: str) -> int | None:
    """Extract a requested result count from free-text search query."""
    if not query or not isinstance(query, str):
        return None
    text = query.strip()
    for pat in _NUM_CARDS_PATTERNS:
        match = pat.search(text)
        if not match:
            continue
        try:
            n = int(match.group(1))
            if 1 <= n <= TOP_PEOPLE_STORED:
                return n
            return max(1, min(TOP_PEOPLE_STORED, n))
        except (ValueError, IndexError):
            continue
    return None


def _resolve_open_to_work_only(body: SearchRequest, must: ParsedConstraintsMust) -> bool:
    if body.open_to_work_only is not None:
        return body.open_to_work_only
    return bool(must.open_to_work_only)


def _resolve_offer_salary_inr_per_year(
    body: SearchRequest, must: ParsedConstraintsMust
) -> float | None:
    if body.salary_max is not None:
        return float(body.salary_max)
    if must.offer_salary_inr_per_year is not None:
        return must.offer_salary_inr_per_year
    return None


async def run_search(
    db: AsyncSession,
    searcher_id: str,
    body: SearchRequest,
    idempotency_key: str | None,
) -> SearchResponse:
    """Production hybrid search."""
    # Viewer language resolution.
    # If the client explicitly sends a non-EN language we trust it immediately.
    target_language = await resolve_viewer_language(db, searcher_id, body.language)
    should_translate_response = target_language.lower() not in ("en", "english")

    # Translate query to English if needed
    original_query = body.query
    if should_translate_response and body.query and body.query.strip():
        from src.services.translation import translate_query_to_english

        body.query = await translate_query_to_english(body.query, target_language, db)
        logger.debug(
            "Translated search query from %s: '%s' -> '%s'",
            target_language,
            original_query,
            body.query,
        )

    if idempotency_key is not None:
        existing = await get_idempotent_response(db, idempotency_key, searcher_id, SEARCH_ENDPOINT)
        response_body = (
            as_dict(getattr(existing, "response_body", None)) if existing is not None else {}
        )
        if response_body:
            return SearchResponse(**response_body)

    # ── PARALLEL: LLM parse + embed + lexical FTS ─────────────────────────────
    # These three are fully independent: fire them all at once and gather.
    # We use a raw query string for the initial embed/lexical so they can start
    # before the LLM parse completes; the parse may refine the embedding text, but
    # the raw query is a good-enough approximation for the first pass.
    raw_query_for_embed = (body.query or "").strip()
    chat = get_chat_provider()

    parse_task = asyncio.create_task(_parse_search_payload(chat, body.query))
    embed_task = asyncio.create_task(_embed_query_vector(raw_query_for_embed, raw_query_for_embed))
    lexical_task = asyncio.create_task(_lexical_candidates(db, raw_query_for_embed))

    parse_exc: Exception | None = None
    embed_exc: Exception | None = None

    try:
        payload, query_vec, lexical_scores = await asyncio.gather(
            parse_task, embed_task, lexical_task, return_exceptions=True
        )
    except Exception as exc:
        raise exc

    # Unpack gather results (may be Exception instances when return_exceptions=True)
    if isinstance(payload, BaseException):
        parse_exc = payload  # type: ignore[assignment]
        payload = None  # type: ignore[assignment]
    if isinstance(query_vec, BaseException):
        embed_exc = query_vec  # type: ignore[assignment]
        query_vec = []
    if isinstance(lexical_scores, BaseException):
        logger.warning("Lexical search task failed, continuing without lexical bonus: %s", lexical_scores)
        lexical_scores = {}

    if parse_exc is not None:
        # LLM parse failure: delegate to the parse function's own fallback path
        logger.warning("Search query parse failed in parallel gather, retrying with fallback: %s", parse_exc)
        payload = await _parse_search_payload(chat, body.query)

    # If the LLM produced a better embedding text, re-embed only when it materially differs
    refined_embedding_text = _build_embedding_text(payload, body)
    if refined_embedding_text and refined_embedding_text != raw_query_for_embed and not embed_exc:
        try:
            query_vec = await _embed_query_vector(body.query, refined_embedding_text)
        except Exception as exc:
            embed_exc = exc
            query_vec = []

    filters_dict = payload.model_dump(mode="json")

    if body.num_cards is not None:
        num_cards = max(1, min(TOP_PEOPLE_STORED, body.num_cards))
    else:
        raw_query = (body.query or payload.query_original or payload.query_cleaned or "").strip()
        num_cards = payload.num_cards
        if num_cards is None:
            num_cards = _extract_num_cards_from_query(raw_query)
        if num_cards is None:
            num_cards = DEFAULT_NUM_CARDS
        num_cards = max(1, min(TOP_PEOPLE_STORED, num_cards))

    if await get_balance(db, searcher_id) < num_cards:
        raise HTTPException(status_code=402, detail="Insufficient credits")

    if embed_exc:
        raise embed_exc
    if not query_vec:
        return await _create_empty_search_response(
            db,
            searcher_id,
            body,
            filters_dict,
            idempotency_key,
            num_cards=num_cards,
            saved_query_text=original_query,
        )

    must = payload.must
    exclude = payload.exclude

    open_to_work_only = _resolve_open_to_work_only(body, must)
    offer_salary_inr_per_year = _resolve_offer_salary_inr_per_year(body, must)

    term_ctx = _collect_constraint_terms(
        must=must,
        exclude_company_norm=exclude.company_norm,
        exclude_keywords=exclude.keywords,
    )

    # Also refine the lexical scores with the parsed query_ts when it differs from raw
    query_ts = _build_query_ts(payload, body)
    if query_ts and query_ts != raw_query_for_embed:
        try:
            lexical_scores = await _lexical_candidates(db, query_ts)
        except Exception as exc:
            logger.warning("Refined lexical search failed, keeping initial scores: %s", exc)

    # Dynamic min_results floor: no need to over-fetch when num_cards is small
    effective_min_results = max(num_cards * 2, MIN_RESULTS)

    fallback_tier, rows, child_rows, child_evidence_rows = await _fetch_candidates_with_fallback(
        db=db,
        query_vec=query_vec,
        body=body,
        must=must,
        company_norms=term_ctx.company_norms,
        team_norms=term_ctx.team_norms,
        time_start=term_ctx.time_start,
        time_end=term_ctx.time_end,
        exclude_norms=term_ctx.exclude_company_norms,
        norm_terms_exclude=term_ctx.exclude_keyword_terms,
        open_to_work_only=open_to_work_only,
        offer_salary_inr_per_year=offer_salary_inr_per_year,
        effective_min_results=effective_min_results,
    )

    all_person_ids = set(str(r[0].person_id) for r in rows) | set(
        str(r.person_id) for r in child_rows
    )
    if not all_person_ids:
        scores_for_fallback = lexical_scores
        if not scores_for_fallback and (body.query or "").strip():
            scores_for_fallback = await _lexical_candidates_relaxed(db, (body.query or "").strip())
        if scores_for_fallback:
            logger.info(
                "Search: no vector candidates, using lexical-only fallback (e.g. unembedded cards)"
            )
            rows, child_rows, child_evidence_rows = await _fetch_candidates_lexical_only(
                db, scores_for_fallback, limit_people=max(num_cards * 2, MIN_RESULTS)
            )

    children_by_id_early = await _load_child_evidence_map(db, child_evidence_rows)

    person_cards, child_sims_by_person, child_best_parent_ids, person_best, graph_features_map = (
        _collapse_and_rank_persons(
            rows,
            child_rows,
            child_evidence_rows,
            payload,
            lexical_scores,
            fallback_tier,
            term_ctx.query_has_time,
            term_ctx.query_has_location,
            must,
            children_by_id=children_by_id_early,
        )
    )
    ranked_people_full = person_best[:TOP_PEOPLE_STORED]

    if not ranked_people_full:
        return await _create_empty_search_response(
            db,
            searcher_id,
            body,
            filters_dict,
            idempotency_key,
            fallback_tier=fallback_tier,
            num_cards=num_cards,
            saved_query_text=original_query,
        )

    person_ids_full = [pid for pid, _score in ranked_people_full]
    people_map, vis_map, children_by_id = await _load_people_profiles_and_children(
        db=db,
        person_ids=person_ids_full,
        child_evidence_rows=child_evidence_rows,
        preloaded_children=children_by_id_early,
    )

    ranked_people_full = _apply_post_rank_tiebreakers(
        people=ranked_people_full,
        vis_map=vis_map,
        person_cards=person_cards,
        offer_salary_inr_per_year=offer_salary_inr_per_year,
        time_start=term_ctx.time_start,
        time_end=term_ctx.time_end,
    )

    search_rec = await _create_search_record(
        db=db,
        searcher_id=searcher_id,
        query_text=original_query,
        filters_dict=filters_dict,
        fallback_tier=fallback_tier,
    )
    await _deduct_search_credits_or_raise(db, searcher_id, str(search_rec.id), num_cards)

    child_only_task = asyncio.create_task(
        _load_child_only_cards(
            db=db,
            pid_list=person_ids_full,
            person_cards=person_cards,
            child_best_parent_ids=child_best_parent_ids,
        )
    )
    similarity_by_person, pending_search_rows, llm_people_evidence = _prepare_pending_search_rows(
        ranked_people=ranked_people_full,
        person_cards=person_cards,
        child_sims_by_person=child_sims_by_person,
        child_best_parent_ids=child_best_parent_ids,
        children_by_id=children_by_id,
        vis_map=vis_map,
        payload=payload,
    )

    pending_to_persist = pending_search_rows[:num_cards]
    llm_evidence_to_persist = llm_people_evidence[:num_cards] if llm_people_evidence else []

    # ── Why-matched: always return fallback bullets immediately ───────────────
    # We persist fallback bullets now so the response is fast, then fire the LLM
    # in a background task to overwrite SearchResult.extra["why_matched"] after
    # the response is already on its way to the client.
    # (Previously the LLM call blocked the entire response for 500–1500 ms.)
    why_matched_by_person = _persist_search_results(
        db=db,
        search_id=str(search_rec.id),
        pending_search_rows=pending_to_persist,
        llm_why_by_person={},  # always use fallback for initial response
        graph_features_map=graph_features_map,
    )
    if llm_evidence_to_persist:
        boost_qctx = {
            "query_original": payload.query_original or "",
            "query_cleaned": payload.query_cleaned or payload.query_original or "",
            "must": payload.must.model_dump(mode="json"),
            "should": payload.should.model_dump(mode="json"),
        }
        boost_payloads = build_match_explanation_payload(boost_qctx, llm_evidence_to_persist)
        why_matched_by_person = boost_query_matching_reasons(
            why_matched_by_person, boost_payloads, payload.query_original or ""
        )
        # Always fire async LLM why-matched to update DB in background
        asyncio.create_task(
            _update_why_matched_async(
                search_id=str(search_rec.id),
                payload=payload,
                people_evidence=llm_evidence_to_persist,
                person_ids=[row.person_id for row in pending_to_persist],
            )
        )

    child_only_cards = await child_only_task
    ranked_people_initial = ranked_people_full[:num_cards]
    people_list = _build_search_people_list(
        ranked_people_initial,
        people_map,
        vis_map,
        person_cards,
        child_only_cards,
        similarity_by_person,
        why_matched_by_person,
    )

    if should_translate_response and people_list:
        from src.services.locale_display import localize_person_search_results_for_viewer

        await localize_person_search_results_for_viewer(db, people_list, target_language)

    resp = SearchResponse(search_id=str(search_rec.id), people=people_list, num_cards=num_cards)
    if idempotency_key is not None:
        await save_idempotent_response(
            db,
            idempotency_key,
            searcher_id,
            SEARCH_ENDPOINT,
            200,
            resp.model_dump(mode="json"),
        )
    return resp


async def load_search_more(
    db: AsyncSession,
    searcher_id: str,
    search_id: str,
    offset: int,
    limit: int = LOAD_MORE_LIMIT,
    skip_credits: bool = False,
    language: str = "en",
) -> list[PersonSearchResult]:
    """Fetch the next batch of search results (by rank)."""
    await _validate_search_session(db, searcher_id, search_id)

    stmt = (
        select(SearchResult)
        .where(SearchResult.search_id == search_id)
        .order_by(SearchResult.rank.asc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    if not rows:
        return []

    if not skip_credits:
        if await get_balance(db, searcher_id) < 1:
            raise HTTPException(status_code=402, detail="Insufficient credits")
        if not await deduct_credits(db, searcher_id, 1, "search_more", "search_id", search_id):
            raise HTTPException(status_code=402, detail="Insufficient credits")

    person_ids = [str(r.person_id) for r in rows]
    card_ids = list(
        dict.fromkeys(cid for r in rows for cid in (r.extra or {}).get("matched_parent_ids") or [])
    )

    people_result = await db.execute(select(Person).where(Person.id.in_(person_ids)))
    profiles_result = await db.execute(
        select(PersonProfile).where(PersonProfile.person_id.in_(person_ids))
    )
    people_map = {str(p.id): p for p in people_result.scalars().all()}
    vis_map = {str(p.person_id): p for p in profiles_result.scalars().all()}
    if card_ids:
        cards_result = await db.execute(
            select(ExperienceCard).where(ExperienceCard.id.in_(card_ids))
        )
        cards_by_id = {str(c.id): c for c in cards_result.scalars().all()}
    else:
        cards_by_id = {}

    out: list[PersonSearchResult] = []
    for r in rows:
        pid = str(r.person_id)
        person = people_map.get(pid)
        vis = vis_map.get(pid)
        extra = r.extra or {}
        matched_ids = extra.get("matched_parent_ids") or []
        why_matched = extra.get("why_matched") or []
        best_cards = [cards_by_id[cid] for cid in matched_ids if cid in cards_by_id][:3]
        raw_score_decimal = attr_decimal(r, "score")
        raw_score = float(raw_score_decimal) if raw_score_decimal is not None else 0.0
        similarity = int(round(max(0.0, min(1.0, raw_score)) * 100))

        out.append(
            PersonSearchResult(
                id=pid,
                name=attr_str(person, "display_name") if person else None,
                headline=_build_person_headline(vis),
                bio=_build_person_bio(vis),
                profile_photo_url=_build_search_profile_photo_url(pid, vis),
                similarity_percent=similarity,
                why_matched=why_matched,
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

    raw_lang = await resolve_viewer_language(db, searcher_id, language)
    if raw_lang.lower() not in ("en", "english") and out:
        from src.services.locale_display import localize_person_search_results_for_viewer

        await localize_person_search_results_for_viewer(db, out, raw_lang)
    return out


async def list_searches(
    db: AsyncSession,
    searcher_id: str,
    limit: int = 50,
) -> SavedSearchesResponse:
    """List recent searches for the searcher."""
    now = datetime.now(UTC)
    stmt = (
        select(
            Search.id,
            Search.query_text,
            Search.created_at,
            Search.expires_at,
            func.count(SearchResult.id).label("result_count"),
        )
        .select_from(Search)
        .outerjoin(SearchResult, SearchResult.search_id == Search.id)
        .where(Search.searcher_id == searcher_id)
        .group_by(Search.id, Search.query_text, Search.created_at, Search.expires_at)
        .order_by(Search.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    rows = result.all()

    out: list[SavedSearchItem] = []
    for sid, query_text, created_at, expires_at, cnt in rows:
        expired = bool(expires_at and expires_at < now)
        out.append(
            SavedSearchItem(
                id=str(sid),
                query_text=query_text or "",
                created_at=created_at.isoformat() if created_at else "",
                expires_at=expires_at.isoformat() if expires_at else "",
                expired=expired,
                result_count=int(cnt or 0),
            )
        )
    return SavedSearchesResponse(searches=out)


async def delete_search(db: AsyncSession, searcher_id: str, search_id: str) -> bool:
    """Delete a search owned by the searcher."""
    result = await db.execute(
        delete(Search).where(Search.id == search_id, Search.searcher_id == searcher_id)
    )
    return bool(cast(Any, result).rowcount > 0)
