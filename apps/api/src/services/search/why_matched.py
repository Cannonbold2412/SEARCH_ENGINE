"""Public search explainability helpers.

This module centralizes the why-matched payload builder, deterministic fallbacks,
and async LLM refresh flow used by search orchestration and persisted search
results.
"""

from __future__ import annotations

from .why_matched_helpers import (
    _FALLBACK_WHY_MATCHED,
    EVIDENCE_SNIPPET_MAX_LEN,
    WHY_REASON_MAX_ITEMS,
    WHY_REASON_MAX_LEN,
    WHY_REASON_MAX_WORDS,
    _build_person_why_evidence,
    _child_display_fields,
    _company_matches_query,
    _extract_query_terms,
    _generate_llm_why_matched,
    _update_why_matched_async,
    _why_matched_fallback_all,
    boost_query_matching_reasons,
    build_match_explanation_payload,
    clean_why_reason,
    dedupe_strings_preserve_order,
    fallback_build_why_matched,
    sanitize_text_for_llm,
    truncate_evidence,
    truncate_reason_to_max_words,
    validate_why_matched_output,
)

__all__ = [
    "WHY_REASON_MAX_LEN",
    "WHY_REASON_MAX_WORDS",
    "WHY_REASON_MAX_ITEMS",
    "EVIDENCE_SNIPPET_MAX_LEN",
    "sanitize_text_for_llm",
    "dedupe_strings_preserve_order",
    "truncate_evidence",
    "truncate_reason_to_max_words",
    "clean_why_reason",
    "build_match_explanation_payload",
    "validate_why_matched_output",
    "fallback_build_why_matched",
    "boost_query_matching_reasons",
    "_child_display_fields",
    "_extract_query_terms",
    "_company_matches_query",
    "_build_person_why_evidence",
    "_why_matched_fallback_all",
    "_generate_llm_why_matched",
    "_update_why_matched_async",
    "_FALLBACK_WHY_MATCHED",
]
