"""Search scoring: similarity helpers, weight constants, and person-ranking logic.

Extracted from search_logic.py. Responsible for:
- Scoring weight + penalty constants
- Fallback tier constants
- Per-card and per-person scoring
- Ranking and tiebreaker helpers
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from src.db.models import ExperienceCard, ExperienceCardChild, PersonProfile
from src.schemas.search import ParsedConstraintsMust, ParsedConstraintsShould
from src.services.experience.search_document import (
    build_parent_search_document,
    get_child_search_document,
)

from ._runtime_values import attr_date, attr_decimal
from .graph_view import (
    PersonGraphFeatures,
    compute_graph_bonus,
    extract_person_graph_features,
)

# -----------------------------------------------------------------------------
# Scoring weight constants
# -----------------------------------------------------------------------------
WEIGHT_PARENT_BEST = 0.55
WEIGHT_CHILD_BEST = 0.30
WEIGHT_AVG_TOP3 = 0.15
LEXICAL_BONUS_MAX = 0.25
SHOULD_BOOST = 0.05
SHOULD_CAP = 10
SHOULD_BONUS_MAX = 0.25
MISSING_DATE_PENALTY = 0.15
LOCATION_MISMATCH_PENALTY = 0.15

# Fallback tiers (stored in Search.extra): 0=strict, 1=time soft, 2=location soft, 3=company/team soft
FALLBACK_TIER_STRICT = 0
FALLBACK_TIER_TIME_SOFT = 1
FALLBACK_TIER_LOCATION_SOFT = 2
FALLBACK_TIER_COMPANY_TEAM_SOFT = 3

# Top-K card sims used for avg in blended score
TOP_K_CARDS = 5

# Max matched cards per person in results
MATCHED_CARDS_PER_PERSON = 3


# -----------------------------------------------------------------------------
# Date and text helpers (pure, no I/O)
# -----------------------------------------------------------------------------
def _parse_date(s: str | None) -> date | None:
    """Parse YYYY-MM-DD or YYYY-MM to date; return None if invalid or missing."""
    if not s or not isinstance(s, str):
        return None
    s = s.strip()
    for fmt in ("%Y-%m-%d", "%Y-%m"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _card_dates_overlap_query(
    card_start: date | None,
    card_end: date | None,
    query_start: date | None,
    query_end: date | None,
) -> bool:
    """True if card has both dates and [card_start, card_end] overlaps [query_start, query_end]."""
    if card_start is None or card_end is None or query_start is None or query_end is None:
        return False
    return card_start <= query_end and card_end >= query_start


def _text_contains_any(haystack: str, terms: list[str]) -> bool:
    """True if any term (lower) appears in haystack (lower)."""
    if not terms or not (haystack or "").strip():
        return False
    h = haystack.lower()
    return any((t or "").strip().lower() in h for t in terms if (t or "").strip())


# -----------------------------------------------------------------------------
# Similarity
# -----------------------------------------------------------------------------
def _similarity_from_distance(d: float) -> float:
    """Map a distance value to a bounded similarity score in (0, 1]."""
    return 1.0 / (1.0 + float(d)) if d is not None else 0.0


def _score_to_similarity_percent(score: float) -> int:
    """Convert blended score to UI-friendly similarity percentage."""
    normalized = max(0.0, min(1.0, float(score)))
    return int(round(normalized * 100))


# -----------------------------------------------------------------------------
# Should-bonus helpers
# -----------------------------------------------------------------------------
def _should_bonus_from_phrases(
    phrases: list, doc_text: str, should: ParsedConstraintsShould
) -> int:
    """Count should-hits from search_phrases and search_document."""
    hits = 0
    phrases_lower = [p.lower() for p in (phrases or []) if p]
    doc_text = (doc_text or "") or ""
    skills_or_tools = [
        t.strip().lower() for t in (should.skills_or_tools or []) if (t or "").strip()
    ]
    if skills_or_tools and (
        any(any(t in p for p in phrases_lower) for t in skills_or_tools)
        or _text_contains_any(doc_text, skills_or_tools)
    ):
        hits += 1
    keywords = [t.strip().lower() for t in (should.keywords or []) if (t or "").strip()]
    if keywords and (
        any(any(t in p for p in phrases_lower) for t in keywords)
        or _text_contains_any(doc_text, keywords)
    ):
        hits += 1
    return hits


def _should_bonus(
    card: ExperienceCard | ExperienceCardChild, should: ParsedConstraintsShould
) -> int:
    """Count how many should-constraints this card matches (for rerank boost)."""
    if isinstance(card, ExperienceCardChild):
        doc_text = get_child_search_document(card)
        card_intent_secondary: list[str] = []
    else:
        doc_text = build_parent_search_document(card)
        card_intent_secondary = list(card.intent_secondary or [])
    hits = _should_bonus_from_phrases([], doc_text, should)
    if should.intent_secondary and any(i in card_intent_secondary for i in should.intent_secondary):
        hits += 1
    return hits


# -----------------------------------------------------------------------------
# Per-person scoring helpers
# -----------------------------------------------------------------------------
def _collect_child_best_parent_ids(child_evidence_rows: list) -> dict[str, list[str]]:
    """Track up to MATCHED_CARDS_PER_PERSON distinct best parent IDs per person from child evidence rows."""
    child_best_parent_ids: dict[str, list[str]] = {}
    for row in child_evidence_rows:
        pid = str(row.person_id)
        parent_id = str(row.parent_experience_id)
        if pid not in child_best_parent_ids:
            child_best_parent_ids[pid] = []
        if parent_id in child_best_parent_ids[pid]:
            continue
        if len(child_best_parent_ids[pid]) >= MATCHED_CARDS_PER_PERSON:
            continue
        child_best_parent_ids[pid].append(parent_id)
    return child_best_parent_ids


def _build_parent_card_scores(
    rows: list,
    should: ParsedConstraintsShould,
) -> tuple[dict[str, list[tuple[ExperienceCard, float]]], dict[str, int]]:
    """Build per-person parent-card scores and cumulative should-hit counts."""
    from collections import defaultdict

    person_cards: dict[str, list[tuple[ExperienceCard, float]]] = defaultdict(list)
    person_should_hits: dict[str, int] = defaultdict(int)

    for card, dist_raw in rows:
        dist = float(dist_raw) if dist_raw is not None else 1.0
        sim = _similarity_from_distance(dist)
        should_hits = min(_should_bonus(card, should), SHOULD_CAP)
        pid = str(card.person_id)
        person_should_hits[pid] += should_hits
        person_cards[pid].append((card, sim + (should_hits * SHOULD_BOOST)))

    for card_rows in person_cards.values():
        card_rows.sort(key=lambda item: -item[1])
    return person_cards, person_should_hits


def _build_child_similarity_maps(
    child_rows: list,
    child_evidence_rows: list,
) -> tuple[dict[str, list[tuple[str, str, float]]], dict[str, float]]:
    """Build child evidence list per person and best child similarity fallback per person."""
    from collections import defaultdict

    child_best_sim: dict[str, float] = {}
    for row in child_rows:
        pid = str(row.person_id)
        dist = float(row.dist) if row.dist is not None else 1.0
        child_best_sim[pid] = max(child_best_sim.get(pid, 0.0), _similarity_from_distance(dist))

    child_sims_by_person: dict[str, list[tuple[str, str, float]]] = defaultdict(list)
    for row in child_evidence_rows:
        pid = str(row.person_id)
        parent_id = str(row.parent_experience_id)
        child_id = str(row.child_id)
        dist = float(row.dist) if row.dist is not None else 1.0
        child_sims_by_person[pid].append((parent_id, child_id, _similarity_from_distance(dist)))

    for pid, sim in child_best_sim.items():
        if pid not in child_sims_by_person:
            child_sims_by_person[pid].append(("", "", sim))

    for child_rows_for_person in child_sims_by_person.values():
        child_rows_for_person.sort(key=lambda item: -item[2])
    return child_sims_by_person, child_best_sim


def _has_location_match(
    parent_cards: list[tuple[ExperienceCard, float]],
    query_loc_terms: list[str],
) -> bool:
    """Return True when any parent card location contains one of the query location terms."""
    if not parent_cards or not query_loc_terms:
        return False
    for card, _ in parent_cards:
        card_location = (getattr(card, "location", None) or "").lower()
        if any(loc in card_location for loc in query_loc_terms):
            return True
    return False


def _build_person_children_map(
    child_evidence_rows: list,
    children_by_id: dict[str, ExperienceCardChild],
) -> dict[str, list[ExperienceCardChild]]:
    """Build per-person list of ExperienceCardChild objects from evidence rows and the loaded child map."""
    result: dict[str, list[ExperienceCardChild]] = {}
    for row in child_evidence_rows:
        pid = str(row.person_id)
        child_id = str(row.child_id)
        child_obj = children_by_id.get(child_id)
        if child_obj is not None:
            result.setdefault(pid, [])
            if child_obj not in result[pid]:
                result[pid].append(child_obj)
    return result


# -----------------------------------------------------------------------------
# Core person scorer
# -----------------------------------------------------------------------------
def _score_person(
    pid: str,
    parent_cards: list[tuple[ExperienceCard, float]],
    child_cards: list[tuple[str, str, float]],
    *,
    child_best_sim: dict[str, float],
    lexical_scores: dict[str, float],
    person_should_hits: dict[str, int],
    fallback_tier: int,
    query_has_time: bool,
    query_has_location: bool,
    query_loc_terms: list[str],
    graph_features: PersonGraphFeatures | None = None,
    must: ParsedConstraintsMust | None = None,
    should: ParsedConstraintsShould | None = None,
) -> float:
    """Compute final blended score for one person."""
    all_sims = [sim for _, sim in parent_cards]
    all_sims.extend(sim for _, _, sim in child_cards)
    all_sims.sort(reverse=True)
    top_k = all_sims[:TOP_K_CARDS]

    parent_best = max((sim for _, sim in parent_cards), default=0.0)
    child_best = max((sim for _, _, sim in child_cards), default=child_best_sim.get(pid, 0.0))
    if len(top_k) >= 3:
        avg_top3 = sum(top_k[:3]) / 3.0
    elif top_k:
        avg_top3 = sum(top_k) / len(top_k)
    else:
        avg_top3 = 0.0

    base_score = (
        (WEIGHT_PARENT_BEST * parent_best)
        + (WEIGHT_CHILD_BEST * child_best)
        + (WEIGHT_AVG_TOP3 * avg_top3)
    )
    lexical_bonus = lexical_scores.get(pid, 0.0)
    should_bonus = min(person_should_hits.get(pid, 0) * SHOULD_BOOST, SHOULD_BONUS_MAX)

    graph_bonus = 0.0
    if graph_features is not None and must is not None and should is not None:
        graph_bonus = compute_graph_bonus(graph_features, must, should)

    penalty = 0.0
    if query_has_time and fallback_tier >= FALLBACK_TIER_TIME_SOFT:
        has_any_dated = any(
            getattr(card, "start_date", None) is not None
            or getattr(card, "end_date", None) is not None
            for card, _ in parent_cards
        )
        if not has_any_dated:
            penalty += MISSING_DATE_PENALTY
    if query_has_location and fallback_tier >= FALLBACK_TIER_LOCATION_SOFT:
        if not _has_location_match(parent_cards, query_loc_terms):
            penalty += LOCATION_MISMATCH_PENALTY

    return max(0.0, base_score + lexical_bonus + should_bonus + graph_bonus - penalty)


# -----------------------------------------------------------------------------
# Collapse and rank persons
# -----------------------------------------------------------------------------
def _collapse_and_rank_persons(
    rows: list,
    child_rows: list,
    child_evidence_rows: list,
    payload: Any,
    lexical_scores: dict[str, float],
    fallback_tier: int,
    query_has_time: bool,
    query_has_location: bool,
    must: ParsedConstraintsMust,
    children_by_id: dict[str, ExperienceCardChild] | None = None,
) -> tuple[
    dict[str, list[tuple[ExperienceCard, float]]],
    dict[str, list[tuple[str, str, float]]],
    dict[str, list[str]],
    list[tuple[str, float]],
    dict[str, PersonGraphFeatures],
]:
    """Build person_cards, child evidence, child_best_parent_ids, sorted person_best (pid, score),
    and per-person graph features map."""
    child_best_parent_ids = _collect_child_best_parent_ids(child_evidence_rows)
    person_cards, person_should_hits = _build_parent_card_scores(rows, payload.should)
    child_sims_by_person, child_best_sim = _build_child_similarity_maps(
        child_rows, child_evidence_rows
    )

    person_children_map: dict[str, list[ExperienceCardChild]] = {}
    if children_by_id:
        person_children_map = _build_person_children_map(child_evidence_rows, children_by_id)

    query_loc_terms = [x.lower() for x in (must.city, must.country, must.location_text) if x]
    person_best: list[tuple[str, float]] = []
    graph_features_map: dict[str, PersonGraphFeatures] = {}

    for pid in set(person_cards.keys()) | set(child_best_sim.keys()):
        parent_card_objs = [card for card, _ in person_cards.get(pid, [])]
        child_objs = person_children_map.get(pid, [])
        graph_feat = extract_person_graph_features(
            parent_cards=parent_card_objs,
            children=child_objs,
            must=must,
            should=payload.should,
        )
        graph_features_map[pid] = graph_feat

        final_score = _score_person(
            pid,
            person_cards.get(pid, []),
            child_sims_by_person.get(pid, []),
            child_best_sim=child_best_sim,
            lexical_scores=lexical_scores,
            person_should_hits=person_should_hits,
            fallback_tier=fallback_tier,
            query_has_time=query_has_time,
            query_has_location=query_has_location,
            query_loc_terms=query_loc_terms,
            graph_features=graph_feat,
            must=must,
            should=payload.should,
        )
        person_best.append((pid, final_score))
    person_best.sort(key=lambda x: -x[1])
    return (
        person_cards,
        child_sims_by_person,
        child_best_parent_ids,
        person_best,
        graph_features_map,
    )


# -----------------------------------------------------------------------------
# Post-rank tiebreakers
# -----------------------------------------------------------------------------
def _apply_post_rank_tiebreakers(
    people: list[tuple[str, float]],
    vis_map: dict[str, PersonProfile],
    person_cards: dict[str, list[tuple[ExperienceCard, float]]],
    offer_salary_inr_per_year: float | None,
    time_start: date | None,
    time_end: date | None,
) -> list[tuple[str, float]]:
    """Apply deterministic tiebreak sorting for salary and date completeness."""
    ranked = people
    if offer_salary_inr_per_year is not None:

        def _salary_rank_key(item: tuple[str, float]) -> tuple[float, int]:
            pid, score = item
            vis = vis_map.get(pid)
            has_stated_min = (
                attr_decimal(vis, "work_preferred_salary_min") is not None if vis else False
            )
            return (-score, 0 if has_stated_min else 1)

        ranked = sorted(ranked, key=_salary_rank_key)

    if time_start and time_end:

        def _date_rank_key(item: tuple[str, float]) -> tuple[float, int]:
            pid, score = item
            cards_with_sim = person_cards.get(pid, [])
            has_full_date_overlap = any(
                _card_dates_overlap_query(
                    attr_date(c, "start_date"), attr_date(c, "end_date"), time_start, time_end
                )
                for c, _ in cards_with_sim
            )
            return (-score, 0 if has_full_date_overlap else 1)

        ranked = sorted(ranked, key=_date_rank_key)
    return ranked
