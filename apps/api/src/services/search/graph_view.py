"""Graph-style RAG view over existing ExperienceCard / ExperienceCardChild data.

No new DB columns or migrations are needed.  All computation is pure in-memory,
operating on ORM objects that are already loaded by run_search.

Node naming convention (string IDs):
    "person:{person_id}"
    "exp:{experience_card_id}"
    "skill:{normalized_title}"
    "tool:{normalized_title}"
    "metric:{normalized_title}"
    "achievement:{normalized_title}"
    "responsibility:{normalized_title}"
    "collaboration:{normalized_title}"
    "domain_knowledge:{normalized_title}"
    "exposure:{normalized_title}"
    "education:{normalized_title}"
    "certification:{normalized_title}"
    "domain:{domain_norm}"
    "subdomain:{sub_domain_norm}"
    "company:{company_norm}"
    "location:{city_or_country}"

Edges are computed on-demand from ORM fields; nothing is stored.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from src.db.models import ExperienceCard, ExperienceCardChild
from src.schemas.search import ParsedConstraintsMust, ParsedConstraintsShould

# ---------------------------------------------------------------------------
# Child-type → node-type mapping
# ---------------------------------------------------------------------------
_CHILD_TYPE_TO_NODE_PREFIX: dict[str, str] = {
    "skills": "skill",
    "tools": "tool",
    "metrics": "metric",
    "achievements": "achievement",
    "responsibilities": "responsibility",
    "collaborations": "collaboration",
    "domain_knowledge": "domain_knowledge",
    "exposure": "exposure",
    "education": "education",
    "certifications": "certification",
}

# ---------------------------------------------------------------------------
# Patterns for cross-functional / marketing detection
# ---------------------------------------------------------------------------
_CROSS_FUNCTIONAL_PATTERNS: list[re.Pattern] = [
    re.compile(r"cross[\s\-]?functional", re.I),
    re.compile(r"\bwith\s+(product|design|marketing|engineering|sales|finance|ops)\b", re.I),
    re.compile(r"\b(product|design|marketing|engineering|sales|finance|ops)\s+team", re.I),
    re.compile(r"\bstakeholder", re.I),
    re.compile(r"\binterdisciplinary\b", re.I),
    re.compile(r"\bcollaborate[ds]?\s+with\b", re.I),
]

_MARKETING_PATTERNS: list[re.Pattern] = [
    re.compile(r"\bmarketing\b", re.I),
    re.compile(r"\bgrowth\s+hacking\b", re.I),
    re.compile(r"\bcontent\s+(strategy|marketing)\b", re.I),
    re.compile(r"\bseo\b", re.I),
    re.compile(r"\bcampaign\b", re.I),
    re.compile(r"\bbranding\b", re.I),
    re.compile(r"\bgo[\s\-]to[\s\-]market\b", re.I),
]


# ---------------------------------------------------------------------------
# Node helpers
# ---------------------------------------------------------------------------
def _norm(text: str | None) -> str:
    """Lowercase + strip for node IDs."""
    return (text or "").strip().lower()


def _items_from_child(child: ExperienceCardChild) -> list[dict[str, Any]]:
    """Extract value.items list from a child row (safe)."""
    value = getattr(child, "value", None) or {}
    if not isinstance(value, dict):
        return []
    items = value.get("items") or []
    return items if isinstance(items, list) else []


def _raw_text_from_child(child: ExperienceCardChild) -> str:
    """Extract value.raw_text from a child row (safe)."""
    value = getattr(child, "value", None) or {}
    if not isinstance(value, dict):
        return ""
    return (value.get("raw_text") or "").strip()


def _item_titles(child: ExperienceCardChild) -> list[str]:
    """Return all non-empty item titles for a child row."""
    return [
        item["title"].strip()
        for item in _items_from_child(child)
        if isinstance(item, dict) and (item.get("title") or "").strip()
    ]


def _item_descriptions(child: ExperienceCardChild) -> list[str]:
    """Return all non-empty item descriptions for a child row."""
    return [
        item["description"].strip()
        for item in _items_from_child(child)
        if isinstance(item, dict) and (item.get("description") or "").strip()
    ]


def _child_node_ids(child: ExperienceCardChild) -> list[str]:
    """Compute implicit node IDs for all items in a child row."""
    prefix = _CHILD_TYPE_TO_NODE_PREFIX.get(child.child_type or "")
    if not prefix:
        return []
    return [
        f"{prefix}:{_norm(title)}"
        for title in _item_titles(child)
        if _norm(title)
    ]


def _parent_node_ids(card: ExperienceCard) -> list[str]:
    """Compute implicit structural node IDs for a parent card (domain, company, location)."""
    nodes: list[str] = [f"exp:{card.id}"]
    if card.domain_norm:
        nodes.append(f"domain:{_norm(card.domain_norm)}")
    elif card.domain:
        nodes.append(f"domain:{_norm(card.domain)}")
    if card.sub_domain_norm:
        nodes.append(f"subdomain:{_norm(card.sub_domain_norm)}")
    elif card.sub_domain:
        nodes.append(f"subdomain:{_norm(card.sub_domain)}")
    if card.company_norm:
        nodes.append(f"company:{_norm(card.company_norm)}")
    elif card.company_name:
        nodes.append(f"company:{_norm(card.company_name)}")
    for loc_field in (card.city, card.country, card.location):
        if loc_field:
            nodes.append(f"location:{_norm(loc_field)}")
    return nodes


# ---------------------------------------------------------------------------
# Per-person graph feature extraction
# ---------------------------------------------------------------------------
@dataclass
class PersonGraphFeatures:
    """Lightweight feature bundle derived from a person's matched cards/children.

    All fields are computed purely from ORM objects already loaded by run_search.
    """

    # Child-type dimension flags
    has_metrics: bool = False
    has_collaborations: bool = False
    has_skills: bool = False
    has_tools: bool = False
    has_achievements: bool = False
    has_domain_knowledge: bool = False

    # Dimension count (how many distinct child_types are present)
    dimensions_count: int = 0

    # Domain / company alignment
    domains_matched: list[str] = field(default_factory=list)
    companies_matched: list[str] = field(default_factory=list)
    domain_company_aligned: bool = False  # at least one domain AND one company match

    # Skill / tool hits vs. SHOULD constraints
    skills_hits: list[str] = field(default_factory=list)
    tools_hits: list[str] = field(default_factory=list)

    # Cross-functional collaboration signal
    has_cross_functional: bool = False

    # Marketing signal (from any child dimension)
    has_marketing: bool = False

    # Startup / scaleup signal
    has_startup_company_type: bool = False

    # Metrics non-empty (at least one metric item with a title)
    has_nonempty_metrics: bool = False

    # All node IDs touched (for debugging / analytics)
    node_ids: list[str] = field(default_factory=list)

    # Child types present (for SearchResult.extra)
    child_types_matched: list[str] = field(default_factory=list)


def _text_matches_any(text: str, patterns: list[re.Pattern]) -> bool:
    return any(p.search(text) for p in patterns)


def _norm_terms(terms: list[str] | None) -> list[str]:
    return [t.strip().lower() for t in (terms or []) if (t or "").strip()]


def extract_person_graph_features(
    parent_cards: list[ExperienceCard],
    children: list[ExperienceCardChild],
    must: ParsedConstraintsMust,
    should: ParsedConstraintsShould,
) -> PersonGraphFeatures:
    """Compute graph features for one person from their matched parent cards and children.

    Parameters
    ----------
    parent_cards:
        ExperienceCard ORM objects for this person (already loaded).
    children:
        ExperienceCardChild ORM objects for this person (already loaded or passed in).
    must:
        Parsed MUST constraints from the query.
    should:
        Parsed SHOULD constraints from the query.

    Returns
    -------
    PersonGraphFeatures
        Pure in-memory feature bundle; no DB queries.
    """
    feat = PersonGraphFeatures()

    # Normalized constraint sets for matching
    must_domain_norms = set(_norm_terms(must.domain))
    must_company_norms = set(_norm_terms(must.company_norm))
    should_skills_tools = set(_norm_terms(should.skills_or_tools))

    # ---- Parent-level nodes ------------------------------------------------
    node_ids: list[str] = []
    seen_domains: set[str] = set()
    seen_companies: set[str] = set()

    for card in parent_cards:
        node_ids.extend(_parent_node_ids(card))

        # Domain alignment
        d_norm = _norm(card.domain_norm or card.domain)
        if d_norm and must_domain_norms and d_norm in must_domain_norms:
            if d_norm not in seen_domains:
                feat.domains_matched.append(d_norm)
                seen_domains.add(d_norm)

        # Company alignment
        c_norm = _norm(card.company_norm or card.company_name)
        if c_norm and must_company_norms and c_norm in must_company_norms:
            if c_norm not in seen_companies:
                feat.companies_matched.append(c_norm)
                seen_companies.add(c_norm)

        # Startup / scaleup signal
        ctype = _norm(card.company_type or "")
        if "startup" in ctype or "scaleup" in ctype or "scale-up" in ctype or "early stage" in ctype:
            feat.has_startup_company_type = True

    # ---- Child-level nodes -------------------------------------------------
    seen_child_types: set[str] = set()
    skills_hits_set: set[str] = set()
    tools_hits_set: set[str] = set()

    for child in children:
        ct = child.child_type or ""
        seen_child_types.add(ct)
        node_ids.extend(_child_node_ids(child))

        titles = _item_titles(child)
        descriptions = _item_descriptions(child)
        raw_text = _raw_text_from_child(child)
        all_text = " ".join(titles + descriptions + [raw_text])

        # Dimension flags
        if ct == "metrics":
            feat.has_metrics = True
            if titles:
                feat.has_nonempty_metrics = True
        elif ct == "collaborations":
            feat.has_collaborations = True
            # Cross-functional detection
            if _text_matches_any(all_text, _CROSS_FUNCTIONAL_PATTERNS):
                feat.has_cross_functional = True
        elif ct == "skills":
            feat.has_skills = True
        elif ct == "tools":
            feat.has_tools = True
        elif ct == "achievements":
            feat.has_achievements = True
        elif ct == "domain_knowledge":
            feat.has_domain_knowledge = True

        # Marketing signal from any dimension
        if _text_matches_any(all_text, _MARKETING_PATTERNS):
            feat.has_marketing = True

        # Skills/tools hits vs SHOULD
        if should_skills_tools:
            if ct == "skills":
                for t in titles:
                    if _norm(t) in should_skills_tools:
                        skills_hits_set.add(_norm(t))
            elif ct == "tools":
                for t in titles:
                    if _norm(t) in should_skills_tools:
                        tools_hits_set.add(_norm(t))
            # Also check any dimension title against should_skills_tools
            for t in titles:
                nt = _norm(t)
                if nt in should_skills_tools:
                    if ct == "skills":
                        skills_hits_set.add(nt)
                    elif ct == "tools":
                        tools_hits_set.add(nt)

    # Also check marketing in parent summaries
    for card in parent_cards:
        summary_text = " ".join(filter(None, [card.summary, card.raw_text, card.title]))
        if summary_text and _text_matches_any(summary_text, _MARKETING_PATTERNS):
            feat.has_marketing = True

    feat.skills_hits = sorted(skills_hits_set)
    feat.tools_hits = sorted(tools_hits_set)
    feat.child_types_matched = sorted(seen_child_types)
    feat.dimensions_count = len(seen_child_types)
    feat.node_ids = list(dict.fromkeys(node_ids))  # deduplicated, order-preserving

    # Domain + company alignment
    feat.domain_company_aligned = bool(feat.domains_matched and feat.companies_matched)

    return feat


# ---------------------------------------------------------------------------
# Graph bonus computation
# ---------------------------------------------------------------------------

# Bonus constants (all small, total cap enforced in compute_graph_bonus)
GRAPH_BONUS_DIM_PER_HIT = 0.01       # per high-value dimension present
GRAPH_BONUS_DIM_CAP = 0.04           # cap for dimension coverage bonus
GRAPH_BONUS_DOMAIN_COMPANY = 0.05    # domain + company both aligned
GRAPH_BONUS_CROSS_MARKETING = 0.04   # cross-functional + marketing composite
GRAPH_BONUS_STARTUP_METRICS = 0.03   # startup company type + nonempty metrics
GRAPH_BONUS_TOTAL_CAP = 0.10         # hard cap on total graph bonus


def compute_graph_bonus(
    feat: PersonGraphFeatures,
    must: ParsedConstraintsMust,
    should: ParsedConstraintsShould,
) -> float:
    """Compute a small, bounded graph-aware score bonus.

    Bonus 1 – Child-type coverage
        Each high-value dimension present (metrics, collaborations, skills/tools)
        contributes GRAPH_BONUS_DIM_PER_HIT, capped at GRAPH_BONUS_DIM_CAP.

    Bonus 2 – Domain + company alignment
        If at least one matched parent card has domain_norm in MUST.domain
        AND at least one has company_norm in MUST.company_norm, add
        GRAPH_BONUS_DOMAIN_COMPANY.

    Bonus 3 – Cross-functional + marketing composite
        If the person has both a cross-functional collaboration signal and a
        marketing signal (from any dimension), add GRAPH_BONUS_CROSS_MARKETING.
        This surfaces "BCG + cross-functional + marketing" candidates above
        generic BCG-only matches.

    Bonus 4 – Startup + metrics (fintech use-case)
        If the person has a startup/scaleup company type AND non-empty metrics,
        add GRAPH_BONUS_STARTUP_METRICS.  This favors "fintech startup with
        strong metrics" candidates.

    Total is capped at GRAPH_BONUS_TOTAL_CAP (0.10) so graph signals only
    nudge the ranking rather than dominating similarity scores.
    """
    bonus = 0.0

    # Bonus 1: dimension coverage
    dim_hits = sum([
        feat.has_metrics,
        feat.has_collaborations,
        feat.has_skills or feat.has_tools,
        feat.has_achievements,
        feat.has_domain_knowledge,
    ])
    dim_bonus = min(dim_hits * GRAPH_BONUS_DIM_PER_HIT, GRAPH_BONUS_DIM_CAP)
    bonus += dim_bonus

    # Bonus 2: domain + company alignment
    if feat.domain_company_aligned:
        bonus += GRAPH_BONUS_DOMAIN_COMPANY

    # Bonus 3: cross-functional + marketing composite
    # Only awarded when the query itself carries marketing/cross-functional intent so
    # that a generic backend/Python search is not penalised by unrelated profile traits.
    _query_tokens = {
        t.lower()
        for t in (should.keywords + should.skills_or_tools + should.intent_secondary)
    }
    _MARKETING_QUERY_SIGNALS = frozenset({
        "marketing", "growth", "seo", "campaign", "branding", "content strategy",
        "go-to-market", "gtm", "cross-functional", "cross functional",
    })
    _query_wants_marketing = bool(_query_tokens & _MARKETING_QUERY_SIGNALS)
    if feat.has_cross_functional and feat.has_marketing and _query_wants_marketing:
        bonus += GRAPH_BONUS_CROSS_MARKETING

    # Bonus 4: startup + metrics (fintech / startup query signal)
    # Only awarded when the query explicitly asks for startup/metrics context.
    _STARTUP_QUERY_SIGNALS = frozenset({
        "startup", "startups", "scaleup", "scale-up", "fintech", "metrics",
        "kpis", "kpi", "growth metrics", "traction",
    })
    _query_wants_startup = bool(_query_tokens & _STARTUP_QUERY_SIGNALS)
    if feat.has_startup_company_type and feat.has_nonempty_metrics and _query_wants_startup:
        bonus += GRAPH_BONUS_STARTUP_METRICS

    return min(bonus, GRAPH_BONUS_TOTAL_CAP)


# ---------------------------------------------------------------------------
# Helper: build graph_features dict for SearchResult.extra
# ---------------------------------------------------------------------------
def build_graph_features_dict(feat: PersonGraphFeatures) -> dict[str, Any]:
    """Serialize PersonGraphFeatures into a JSON-safe dict for SearchResult.extra['graph_features']."""
    return {
        "domains_matched": feat.domains_matched,
        "companies_matched": feat.companies_matched,
        "child_types_matched": feat.child_types_matched,
        "skills_hits": feat.skills_hits,
        "tools_hits": feat.tools_hits,
        "dimensions_count": feat.dimensions_count,
        "has_metrics": feat.has_metrics,
        "has_nonempty_metrics": feat.has_nonempty_metrics,
        "has_collaborations": feat.has_collaborations,
        "has_cross_functional": feat.has_cross_functional,
        "has_marketing": feat.has_marketing,
        "has_startup_company_type": feat.has_startup_company_type,
        "domain_company_aligned": feat.domain_company_aligned,
    }
