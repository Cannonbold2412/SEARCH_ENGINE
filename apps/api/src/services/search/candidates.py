"""Search candidate generation: lexical search, filter application, and vector+fallback fetching.

Extracted from search_logic.py. Responsible for:
- FilterContext and SearchConstraintTerms dataclasses
- Full-text lexical search (strict + relaxed)
- MUST/EXCLUDE SQL filter application
- Vector candidate fetching with fallback tiers
- Query parsing and embedding
"""

from __future__ import annotations

import asyncio
import logging
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from typing import Any

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import ExperienceCard, ExperienceCardChild, PersonProfile
from src.providers import (
    ChatServiceError,
    EmbeddingServiceError,
    get_embedding_provider,
)
from src.schemas import SearchRequest
from src.schemas.search import (
    ParsedConstraintsMust,
    ParsedConstraintsPayload,
)
from src.utils import normalize_embedding

from .filter_validator import validate_and_normalize
from .scoring import (
    FALLBACK_TIER_COMPANY_TEAM_SOFT,
    FALLBACK_TIER_LOCATION_SOFT,
    FALLBACK_TIER_STRICT,
    FALLBACK_TIER_TIME_SOFT,
    LEXICAL_BONUS_MAX,
    MATCHED_CARDS_PER_PERSON,
)

logger = logging.getLogger(__name__)

# Candidate query limits
MIN_RESULTS = 15  # absolute floor; dynamic floor = max(num_cards*2, MIN_RESULTS) at call site
OVERFETCH_CARDS = 30  # increased from 10 to reduce fallback tier loop iterations

# Minimal English stopwords for relaxed OR query
_LEXICAL_STOP = frozenset(
    {
        "a",
        "an",
        "the",
        "in",
        "on",
        "at",
        "to",
        "for",
        "of",
        "with",
        "and",
        "or",
        "is",
        "are",
        "was",
        "were",
    }
)

# When migration 035 has been applied, experience_cards.search_doc is a STORED generated
# tsvector column backed by a GIN index.  We use it directly so Postgres can skip the
# per-row concat_ws + to_tsvector computation.  The COALESCE fall-through handles the
# period before the migration is applied (or on fresh empty tables).
_PARENT_TSVEC_SQL = """COALESCE(ec.search_doc,
    to_tsvector('english', concat_ws(' ',
        ec.title, ec.normalized_role, ec.domain, ec.sub_domain, ec.company_name, ec.company_type,
        ec.location, ec.employment_type, ec.summary, ec.raw_text, ec.intent_primary,
        array_to_string(COALESCE(ec.intent_secondary, '{}'::text[]), ' '),
        ec.seniority_level,
        CASE WHEN ec.start_date IS NOT NULL AND ec.end_date IS NOT NULL THEN ec.start_date::text || ' - ' || ec.end_date::text
             WHEN ec.start_date IS NOT NULL THEN ec.start_date::text
             WHEN ec.end_date IS NOT NULL THEN ec.end_date::text ELSE NULL END,
        CASE WHEN ec.is_current = true THEN 'current' ELSE NULL END
    ))
)"""

_CHILD_TSVEC_SQL = """COALESCE(ecc.search_doc,
    to_tsvector('english', concat_ws(' ',
        COALESCE((ecc.value->'items'->0->>'title'), (ecc.value->'items'->0->>'subtitle'), ecc.value->>'summary', ''),
        ecc.value->>'summary', ecc.value->>'raw_text',
        (SELECT string_agg(COALESCE(elem->>'title','') || ' ' || COALESCE(elem->>'subtitle','') || ' ' || COALESCE(elem->>'description','') || ' ' || COALESCE(elem->>'sub_summary',''), ' ')
         FROM jsonb_array_elements(COALESCE(ecc.value->'items', '[]'::jsonb)) elem)
    ))
)"""

# Keep the raw concat_ws form available for places that need the text (not the tsvector)
_PARENT_SEARCH_DOC_SQL = """concat_ws(' ',
    ec.title, ec.normalized_role, ec.domain, ec.sub_domain, ec.company_name, ec.company_type,
    ec.location, ec.employment_type, ec.summary, ec.raw_text, ec.intent_primary,
    array_to_string(COALESCE(ec.intent_secondary, '{}'::text[]), ' '),
    ec.seniority_level,
    CASE WHEN ec.start_date IS NOT NULL AND ec.end_date IS NOT NULL THEN ec.start_date::text || ' - ' || ec.end_date::text
         WHEN ec.start_date IS NOT NULL THEN ec.start_date::text
         WHEN ec.end_date IS NOT NULL THEN ec.end_date::text ELSE NULL END,
    CASE WHEN ec.is_current = true THEN 'current' ELSE NULL END
)"""

_CHILD_SEARCH_DOC_SQL = """concat_ws(' ',
    COALESCE((ecc.value->'items'->0->>'title'), (ecc.value->'items'->0->>'subtitle'), ecc.value->>'summary', ''),
    ecc.value->>'summary', ecc.value->>'raw_text',
    (SELECT string_agg(COALESCE(elem->>'title','') || ' ' || COALESCE(elem->>'subtitle','') || ' ' || COALESCE(elem->>'description','') || ' ' || COALESCE(elem->>'sub_summary',''), ' ')
     FROM jsonb_array_elements(COALESCE(ecc.value->'items', '[]'::jsonb)) elem)
)"""


# -----------------------------------------------------------------------------
# Dataclasses
# -----------------------------------------------------------------------------
@dataclass(frozen=True)
class _FilterContext:
    """Bundle of filter parameters for MUST/EXCLUDE and optional PersonProfile join."""

    apply_company_team: bool
    company_norms: list[str]
    team_norms: list[str]
    must: ParsedConstraintsMust
    apply_location: bool
    apply_time: bool
    time_start: date | None
    time_end: date | None
    exclude_norms: list[str]
    norm_terms_exclude: list[str]
    open_to_work_only: bool
    offer_salary_inr_per_year: float | None
    body: SearchRequest


@dataclass(frozen=True)
class _SearchConstraintTerms:
    """Normalized terms and flags derived from parsed MUST/EXCLUDE constraints."""

    time_start: date | None
    time_end: date | None
    query_has_time: bool
    query_has_location: bool
    company_norms: list[str]
    team_norms: list[str]
    exclude_company_norms: list[str]
    exclude_keyword_terms: list[str]


# -----------------------------------------------------------------------------
# Lexical search
# -----------------------------------------------------------------------------
async def _lexical_candidates(
    db: AsyncSession,
    query_ts: str,
    limit_per_table: int = 100,
) -> dict[str, float]:
    """Full-text search on experience_cards and experience_card_children.
    Returns person_id -> lexical score in [0, 1]; caller caps to LEXICAL_BONUS_MAX.
    """
    query_ts = (query_ts or "").strip()
    if not query_ts:
        return {}
    person_scores: dict[str, float] = {}
    # Use the stored search_doc tsvector (GIN-indexed after migration 035) with a
    # COALESCE fallback to on-the-fly computation for pre-migration rows.
    stmt_parents = text(f"""
        SELECT ec.person_id, ts_rank_cd({_PARENT_TSVEC_SQL}, plainto_tsquery('english', :q)) AS r
        FROM experience_cards ec
        WHERE ec.experience_card_visibility = true
          AND {_PARENT_TSVEC_SQL} @@ plainto_tsquery('english', :q)
        ORDER BY r DESC
        LIMIT :lim
    """)
    stmt_children = text(f"""
        SELECT ecc.person_id, ts_rank_cd({_CHILD_TSVEC_SQL}, plainto_tsquery('english', :q)) AS r
        FROM experience_card_children ecc
        JOIN experience_cards ec ON ec.id = ecc.parent_experience_id AND ec.experience_card_visibility = true
        WHERE {_CHILD_TSVEC_SQL} @@ plainto_tsquery('english', :q)
        ORDER BY r DESC
        LIMIT :lim
    """)
    params = {"q": query_ts, "lim": limit_per_table}
    try:
        _scores: dict[str, float] = defaultdict(float)
        rp = await db.execute(stmt_parents, params)
        rc = await db.execute(stmt_children, params)
        for row in rp.all():
            pid = str(row.person_id)
            _scores[pid] = max(_scores[pid], float(row.r or 0))
        for row in rc.all():
            pid = str(row.person_id)
            _scores[pid] = max(_scores[pid], float(row.r or 0))
        person_scores = dict(_scores)
    except Exception as e:
        logger.warning("Lexical search failed, continuing without lexical bonus: %s", e)
        return {}
    if not person_scores:
        return {}
    max_r = max(person_scores.values())
    if max_r <= 0:
        return {}
    return {
        pid: min(LEXICAL_BONUS_MAX, (s / max_r) * LEXICAL_BONUS_MAX)
        for pid, s in person_scores.items()
    }


def _lexical_query_or_terms(raw_query: str, max_terms: int = 6) -> str:
    """Build a string of space-separated terms for OR matching."""
    if not (raw_query or "").strip():
        return ""
    words = re.findall(r"[a-zA-Z0-9]+", (raw_query or "").strip().lower())
    terms = [w for w in words if len(w) > 1 and w not in _LEXICAL_STOP][:max_terms]
    return " ".join(terms) if terms else (raw_query or "").strip()[:100]


async def _lexical_candidates_relaxed(
    db: AsyncSession,
    raw_query: str,
    limit_per_table: int = 100,
) -> dict[str, float]:
    """Like _lexical_candidates but uses OR semantics so any term can match.
    Used when vector and strict lexical return 0 candidates.
    """
    query_or = _lexical_query_or_terms(raw_query)
    if not query_or:
        return {}
    terms = query_or.split()
    if not terms:
        return {}
    safe_parts = [t for t in terms if t and re.match(r"^[a-zA-Z0-9]+$", t)]
    if not safe_parts:
        return {}
    or_ts = " | ".join(safe_parts)
    stmt_parents = text(f"""
        SELECT ec.person_id, ts_rank_cd({_PARENT_TSVEC_SQL}, to_tsquery('english', :q)) AS r
        FROM experience_cards ec
        WHERE ec.experience_card_visibility = true
          AND {_PARENT_TSVEC_SQL} @@ to_tsquery('english', :q)
        ORDER BY r DESC
        LIMIT :lim
    """)
    stmt_children = text(f"""
        SELECT ecc.person_id, ts_rank_cd({_CHILD_TSVEC_SQL}, to_tsquery('english', :q)) AS r
        FROM experience_card_children ecc
        JOIN experience_cards ec ON ec.id = ecc.parent_experience_id AND ec.experience_card_visibility = true
        WHERE {_CHILD_TSVEC_SQL} @@ to_tsquery('english', :q)
        ORDER BY r DESC
        LIMIT :lim
    """)
    params = {"q": or_ts, "lim": limit_per_table}
    from collections import defaultdict

    _scores: dict[str, float] = defaultdict(float)
    try:
        rp = await db.execute(stmt_parents, params)
        rc = await db.execute(stmt_children, params)
        for row in rp.all():
            pid = str(row.person_id)
            _scores[pid] = max(_scores[pid], float(row.r or 0))
        for row in rc.all():
            pid = str(row.person_id)
            _scores[pid] = max(_scores[pid], float(row.r or 0))
    except Exception as e:
        logger.warning("Lexical relaxed search failed: %s", e)
        return {}
    person_scores = dict(_scores)
    if not person_scores:
        return {}
    max_r = max(person_scores.values())
    if max_r <= 0:
        return {}
    return {
        pid: min(LEXICAL_BONUS_MAX, (s / max_r) * LEXICAL_BONUS_MAX)
        for pid, s in person_scores.items()
    }


# -----------------------------------------------------------------------------
# Card filter application
# -----------------------------------------------------------------------------
def _apply_card_filters(stmt: Any, ctx: _FilterContext) -> Any:
    """Apply MUST/EXCLUDE filters and optional PersonProfile join to a statement."""
    if ctx.apply_company_team and ctx.company_norms:
        stmt = stmt.where(ExperienceCard.company_norm.in_(ctx.company_norms))
    if ctx.apply_company_team and ctx.team_norms:
        stmt = stmt.where(ExperienceCard.team_norm.in_(ctx.team_norms))
    if ctx.must.intent_primary:
        stmt = stmt.where(ExperienceCard.intent_primary.in_(ctx.must.intent_primary))
    if ctx.must.domain:
        raw_domains = [d.strip() for d in ctx.must.domain if (d or "").strip()]
        domain_norms = [d.lower() for d in raw_domains]
        if domain_norms:
            norm_cond = ExperienceCard.domain_norm.in_(domain_norms)
            fallback_raw_cond = None
            if raw_domains:
                fallback_raw_cond = and_(
                    ExperienceCard.domain_norm.is_(None),
                    or_(*[ExperienceCard.domain.ilike(f"%{d}%") for d in raw_domains]),
                )
            stmt = stmt.where(
                or_(norm_cond, fallback_raw_cond) if fallback_raw_cond is not None else norm_cond
            )
    if ctx.must.sub_domain:
        raw_subdomains = [sd.strip() for sd in ctx.must.sub_domain if (sd or "").strip()]
        sub_domain_norms = [sd.lower() for sd in raw_subdomains]
        if sub_domain_norms:
            norm_cond = ExperienceCard.sub_domain_norm.in_(sub_domain_norms)
            fallback_raw_cond = None
            if raw_subdomains:
                fallback_raw_cond = and_(
                    ExperienceCard.sub_domain_norm.is_(None),
                    or_(*[ExperienceCard.sub_domain.ilike(f"%{sd}%") for sd in raw_subdomains]),
                )
            stmt = stmt.where(
                or_(norm_cond, fallback_raw_cond) if fallback_raw_cond is not None else norm_cond
            )
    if ctx.must.employment_type:
        stmt = stmt.where(ExperienceCard.employment_type.in_(ctx.must.employment_type))
    if ctx.must.seniority_level:
        stmt = stmt.where(ExperienceCard.seniority_level.in_(ctx.must.seniority_level))
    if ctx.apply_location and (ctx.must.city or ctx.must.country or ctx.must.location_text):
        loc_conds = []
        if ctx.must.city:
            city = ctx.must.city.strip()
            if city:
                loc_conds.append(
                    or_(
                        ExperienceCard.city.ilike(f"%{city}%"),
                        ExperienceCard.location.ilike(f"%{city}%"),
                    )
                )
        if ctx.must.country:
            country = ctx.must.country.strip()
            if country:
                loc_conds.append(
                    or_(
                        ExperienceCard.country.ilike(f"%{country}%"),
                        ExperienceCard.location.ilike(f"%{country}%"),
                    )
                )
        if ctx.must.location_text:
            loc_text = ctx.must.location_text.strip()
            if loc_text:
                loc_conds.append(ExperienceCard.location.ilike(f"%{loc_text}%"))
        if loc_conds:
            stmt = stmt.where(or_(*loc_conds))
    if ctx.apply_time and ctx.time_start and ctx.time_end:
        at_least_one_bound = or_(
            ExperienceCard.start_date.isnot(None),
            ExperienceCard.end_date.isnot(None),
        )
        overlap = and_(
            or_(ExperienceCard.start_date.is_(None), ExperienceCard.start_date <= ctx.time_end),
            or_(ExperienceCard.end_date.is_(None), ExperienceCard.end_date >= ctx.time_start),
        )
        stmt = stmt.where(at_least_one_bound).where(overlap)
    if ctx.must.is_current is not None:
        stmt = stmt.where(ExperienceCard.is_current == ctx.must.is_current)
    if ctx.exclude_norms:
        stmt = stmt.where(~ExperienceCard.company_norm.in_(ctx.exclude_norms))
    if ctx.open_to_work_only or ctx.offer_salary_inr_per_year is not None:
        join_conds = [ExperienceCard.person_id == PersonProfile.person_id]
        if ctx.open_to_work_only:
            join_conds.append(PersonProfile.open_to_work.is_(True))
        stmt = stmt.join(PersonProfile, and_(*join_conds))
        if ctx.open_to_work_only and ctx.body.preferred_locations:
            loc_arr = [x.strip() for x in ctx.body.preferred_locations if x]
            if loc_arr:
                stmt = stmt.where(PersonProfile.work_preferred_locations.overlap(loc_arr))
        if ctx.offer_salary_inr_per_year is not None:
            stmt = stmt.where(
                or_(
                    PersonProfile.work_preferred_salary_min.is_(None),
                    PersonProfile.work_preferred_salary_min <= ctx.offer_salary_inr_per_year,
                )
            )
    return stmt


# -----------------------------------------------------------------------------
# Candidate row fetching
# -----------------------------------------------------------------------------
async def _fetch_candidate_rows_for_filter_ctx(
    db: AsyncSession,
    query_vec: list[float],
    filter_ctx: _FilterContext,
) -> tuple[list, list, list]:
    """Fetch parent rows, child aggregate rows, and child evidence rows for one fallback tier."""
    dist_expr = ExperienceCard.embedding.cosine_distance(query_vec).label("dist")
    parent_stmt = (
        select(ExperienceCard, dist_expr)
        .where(ExperienceCard.experience_card_visibility.is_(True))
        .where(ExperienceCard.embedding.isnot(None))
    )
    parent_stmt = _apply_card_filters(parent_stmt, filter_ctx)
    parent_stmt = parent_stmt.order_by(dist_expr).limit(OVERFETCH_CARDS)

    child_dist_stmt = (
        select(
            ExperienceCardChild.person_id,
            func.min(ExperienceCardChild.embedding.cosine_distance(query_vec)).label("dist"),
        )
        .join(
            ExperienceCard,
            and_(
                ExperienceCard.id == ExperienceCardChild.parent_experience_id,
                ExperienceCard.experience_card_visibility.is_(True),
            ),
        )
        .where(ExperienceCardChild.embedding.isnot(None))
    )
    child_dist_stmt = _apply_card_filters(child_dist_stmt, filter_ctx)
    child_dist_stmt = child_dist_stmt.group_by(ExperienceCardChild.person_id)

    child_evidence_stmt = (
        select(
            ExperienceCardChild.person_id,
            ExperienceCardChild.parent_experience_id,
            ExperienceCardChild.id.label("child_id"),
            ExperienceCardChild.embedding.cosine_distance(query_vec).label("dist"),
        )
        .join(
            ExperienceCard,
            and_(
                ExperienceCard.id == ExperienceCardChild.parent_experience_id,
                ExperienceCard.experience_card_visibility.is_(True),
            ),
        )
        .where(ExperienceCardChild.embedding.isnot(None))
    )
    child_evidence_stmt = _apply_card_filters(child_evidence_stmt, filter_ctx)
    child_dists_cte = child_evidence_stmt.cte("child_dists")
    rn = (
        func.row_number()
        .over(
            partition_by=child_dists_cte.c.person_id,
            order_by=child_dists_cte.c.dist,
        )
        .label("rn")
    )
    ranked_children = (
        select(
            child_dists_cte.c.person_id,
            child_dists_cte.c.parent_experience_id,
            child_dists_cte.c.child_id,
            child_dists_cte.c.dist,
            rn,
        )
        .select_from(child_dists_cte)
        .subquery("ranked")
    )
    top_children_stmt = (
        select(
            ranked_children.c.person_id,
            ranked_children.c.parent_experience_id,
            ranked_children.c.child_id,
            ranked_children.c.dist,
        )
        .select_from(ranked_children)
        .where(ranked_children.c.rn <= MATCHED_CARDS_PER_PERSON)
    )

    parent_result = await db.execute(parent_stmt)
    child_dist_result = await db.execute(child_dist_stmt)
    child_evidence_result = await db.execute(top_children_stmt)
    return (
        list(parent_result.all()),
        list(child_dist_result.all()),
        list(child_evidence_result.all()),
    )


async def _fetch_candidates_lexical_only(
    db: AsyncSession,
    lexical_scores: dict[str, float],
    limit_people: int = 24,
) -> tuple[list, list, list]:
    """When vector search returns no candidates, build parent rows from lexical scores."""
    if not lexical_scores:
        return [], [], []
    max_score = max(lexical_scores.values()) or 1.0
    person_ids_ordered = sorted(
        lexical_scores.keys(),
        key=lambda p: lexical_scores[p],
        reverse=True,
    )[:limit_people]
    stmt = (
        select(ExperienceCard)
        .where(ExperienceCard.person_id.in_(person_ids_ordered))
        .where(ExperienceCard.experience_card_visibility.is_(True))
    )
    result = (await db.execute(stmt)).scalars().all()
    rows: list[tuple[ExperienceCard, float]] = []
    for card in result:
        pid = str(card.person_id)
        score = lexical_scores.get(pid, 0.0)
        dist = 1.0 - (score / max_score)
        rows.append((card, dist))
    return rows, [], []


async def _fetch_candidates_with_fallback(
    db: AsyncSession,
    query_vec: list[float],
    body: SearchRequest,
    must: ParsedConstraintsMust,
    company_norms: list[str],
    team_norms: list[str],
    time_start: date | None,
    time_end: date | None,
    exclude_norms: list[str],
    norm_terms_exclude: list[str],
    open_to_work_only: bool,
    offer_salary_inr_per_year: float | None,
    effective_min_results: int = MIN_RESULTS,
) -> tuple[int, list, list, list]:
    """Run candidate generation while relaxing MUST tiers until enough unique persons are found.

    ``effective_min_results`` lets the caller pass a dynamic floor (e.g. num_cards * 2) so that
    tightly-filtered queries don't trigger unnecessary extra DB round-trips.
    """
    fallback_tier = FALLBACK_TIER_STRICT
    while True:
        filter_ctx = _build_filter_context_for_tier(
            fallback_tier=fallback_tier,
            body=body,
            must=must,
            company_norms=company_norms,
            team_norms=team_norms,
            time_start=time_start,
            time_end=time_end,
            exclude_norms=exclude_norms,
            norm_terms_exclude=norm_terms_exclude,
            open_to_work_only=open_to_work_only,
            offer_salary_inr_per_year=offer_salary_inr_per_year,
        )
        rows, child_rows, child_evidence_rows = await _fetch_candidate_rows_for_filter_ctx(
            db, query_vec, filter_ctx
        )
        all_person_ids = set(str(r[0].person_id) for r in rows) | set(
            str(r.person_id) for r in child_rows
        )
        if len(all_person_ids) >= effective_min_results or fallback_tier >= FALLBACK_TIER_COMPANY_TEAM_SOFT:
            return fallback_tier, rows, child_rows, child_evidence_rows
        fallback_tier += 1
        logger.info(
            "Search fallback: results %s < effective_min_results %s, relaxing to tier %s",
            len(all_person_ids),
            effective_min_results,
            fallback_tier,
        )


# -----------------------------------------------------------------------------
# Query parsing and embedding
# -----------------------------------------------------------------------------
async def _parse_search_payload(chat: Any, raw_query: str | None) -> ParsedConstraintsPayload:
    """Parse query constraints with LLM and apply validation/normalization."""
    try:
        filters_raw = await chat.parse_search_filters(raw_query)
    except ChatServiceError as exc:
        logger.warning("Search query parse failed, using raw-query fallback: %s", exc)
        fallback_query = (raw_query or "").strip()
        filters_raw = {
            "query_original": fallback_query,
            "query_cleaned": fallback_query,
            "query_embedding_text": fallback_query,
        }
    return validate_and_normalize(ParsedConstraintsPayload.from_llm_dict(filters_raw))


async def _embed_query_vector(raw_query: str | None, embedding_text: str) -> list[float]:
    """Embed query text and return normalized vector; raise 503 on provider failure."""
    try:
        embed_provider = get_embedding_provider()
        vector_inputs = [embedding_text or raw_query or ""]
        vectors = await embed_provider.embed(vector_inputs)
        if not vectors:
            return []
        return normalize_embedding(vectors[0], embed_provider.dimension)
    except (EmbeddingServiceError, RuntimeError) as exc:
        logger.warning("Search embedding failed (503): %s", exc, exc_info=True)
        raise HTTPException(status_code=503, detail=str(exc))


def _build_embedding_text(payload: ParsedConstraintsPayload, body: SearchRequest) -> str:
    """Build embedding input text from parsed payload with raw-query fallback."""
    return (payload.query_embedding_text or payload.query_original or body.query or "").strip() or (
        body.query or ""
    )


def _build_query_ts(payload: ParsedConstraintsPayload, body: SearchRequest) -> str:
    """Build lexical tsquery input from parsed search phrases and top keywords."""
    query_ts_parts = list(payload.search_phrases or []) + list((payload.should.keywords or [])[:5])
    parsed_ts = " ".join(str(part).strip() for part in query_ts_parts if str(part).strip())
    return parsed_ts or (payload.query_cleaned or body.query or "")[:200]


def _normalize_lower_terms(values: list[str] | None) -> list[str]:
    """Trim and lowercase term arrays while dropping empty values."""
    return [item.strip().lower() for item in (values or []) if (item or "").strip()]


def _collect_constraint_terms(
    must: ParsedConstraintsMust,
    exclude_company_norm: list[str] | None,
    exclude_keywords: list[str] | None,
) -> _SearchConstraintTerms:
    """Collect normalized MUST/EXCLUDE terms and commonly used query flags."""
    from .scoring import _parse_date

    time_start = _parse_date(must.time_start)
    time_end = _parse_date(must.time_end)
    return _SearchConstraintTerms(
        time_start=time_start,
        time_end=time_end,
        query_has_time=time_start is not None and time_end is not None,
        query_has_location=bool(must.city or must.country or must.location_text),
        company_norms=_normalize_lower_terms(must.company_norm),
        team_norms=_normalize_lower_terms(must.team_norm),
        exclude_company_norms=_normalize_lower_terms(exclude_company_norm),
        exclude_keyword_terms=_normalize_lower_terms(exclude_keywords),
    )


def _build_filter_context_for_tier(
    fallback_tier: int,
    body: SearchRequest,
    must: ParsedConstraintsMust,
    company_norms: list[str],
    team_norms: list[str],
    time_start: date | None,
    time_end: date | None,
    exclude_norms: list[str],
    norm_terms_exclude: list[str],
    open_to_work_only: bool,
    offer_salary_inr_per_year: float | None,
) -> _FilterContext:
    """Create per-tier filter context used by parent and child candidate queries."""
    return _FilterContext(
        apply_company_team=fallback_tier < FALLBACK_TIER_COMPANY_TEAM_SOFT,
        company_norms=company_norms,
        team_norms=team_norms,
        must=must,
        apply_location=fallback_tier < FALLBACK_TIER_LOCATION_SOFT,
        apply_time=fallback_tier < FALLBACK_TIER_TIME_SOFT,
        time_start=time_start,
        time_end=time_end,
        exclude_norms=exclude_norms,
        norm_terms_exclude=norm_terms_exclude,
        open_to_work_only=open_to_work_only,
        offer_salary_inr_per_year=offer_salary_inr_per_year,
        body=body,
    )
