"""
LLM prompt templates for experience extraction and Experience Card pipeline.

Converts RAW, unstructured text (informal, noisy, incomplete) into structured
ExperienceCards. Normalizes terms, infers meaning carefully, and preserves
the user's original intent.

Pipeline order:
  1. REWRITE         -- messy user text -> clear + cleaned text
  2. EXTRACT_SINGLE  -- one experience (builder transcript commit uses index 1 of 1) -> parent + children
  3. FILL_MISSING    -- optional targeted fields from messy text (edit flows)

Placeholders (double-brace, replace before sending to LLM):
  - {{USER_TEXT}}                -- raw user message
  - {{PERSON_ID}}                -- person_id / created_by
  - {{PARENT_AND_CHILDREN_JSON}} -- parent + children JSON
"""

from .experience_card import (
    PROMPT_FILL_MISSING_FIELDS,
    PROMPT_REWRITE,
    fill_prompt,
)

__all__ = [
    "PROMPT_REWRITE",
    "PROMPT_FILL_MISSING_FIELDS",
    "fill_prompt",
]
