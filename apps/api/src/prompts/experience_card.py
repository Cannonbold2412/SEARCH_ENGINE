"""
Experience Card pipeline prompts.

Designed to take messy, informal, noisy, or incomplete human text and produce:
  rewrite -> extract single (parent + children) -> validate.

The system converts free-form text into structured Experience Cards
(parent + dimension-based children), with structured parent and child cards.

Domains supported: tech + non-tech + mixed.
"""

from typing import get_args

from src.domain import (
    ALLOWED_CHILD_TYPES,
    CompanyType,
    EmploymentType,
    Intent,
    SeniorityLevel,
)

# Enum strings used in LLM prompts (derived from src.domain — single source of truth)
INTENT_ENUM = ", ".join(get_args(Intent))
SENIORITY_LEVEL_ENUM = ", ".join(get_args(SeniorityLevel))
EMPLOYMENT_TYPE_ENUM = ", ".join(get_args(EmploymentType))
COMPANY_TYPE_ENUM = ", ".join(get_args(CompanyType))
ALLOWED_CHILD_TYPES_STR = ", ".join(ALLOWED_CHILD_TYPES)

# -----------------------------------------------------------------------------
# 1. Rewrite + Cleanup (single pass)
# -----------------------------------------------------------------------------

PROMPT_REWRITE = """You are a rewrite and cleanup engine. Your only job is to make the input easier to parse — not to interpret, summarize, or enrich it.

GOAL:
Rewrite the input into clear, grammatically correct English. Remove noise. Preserve all meaning and facts exactly as given.

RULES:
1. Do NOT add facts, infer missing details, or change meaning in any way.
2. Keep all proper nouns, names, places, organizations, tools, numbers, and dates exactly as written.
3. Preserve structure — if the input has a list, keep it a list. If it has an order, keep that order.
4. Expand abbreviations only when the expansion is unambiguous.
5. Remove filler words, repetition, typos, and grammatical noise.
6. If the input is already clean, return it as-is. Do not rephrase for the sake of it.
7. Output ONLY the rewritten text. No explanations, no commentary, no JSON, no preamble.

QUALITY GATE — before rewriting, check if the input contains a real, extractable work experience described by the user. Output the single token INSUFFICIENT_INPUT (nothing else) if ANY of these are true:
- The text is only an assistant/bot greeting or prompt with no user response (e.g. "Welcome to Conexa. Tell me about…").
- The text contains no substantive description of something the user built, worked on, or handled.
- The user's contribution is only greetings, filler, or acknowledgements ("hi", "ok", "sure", "thanks") with no experience details.
- The text is clearly truncated mid-sentence with no complete thought about a work experience.
If the input passes the quality gate, proceed with the rewrite as normal.

INPUT:
{{USER_TEXT}}
"""


# -----------------------------------------------------------------------------
# 2. Extract SINGLE experience by index (builder commit uses 1 of 1)
# -----------------------------------------------------------------------------

PROMPT_EXTRACT_SINGLE_CARDS = """You are a structured data extraction system.

The cleaned text may mention more than one role or project. Extract exactly ONE experience — the one at position {{EXPERIENCE_INDEX}} of {{EXPERIENCE_COUNT}}. When the count is 1, treat this as a single pass over the full narrative: prefer the primary or most salient experience.

Ignore other experiences in the text for this extraction.

---

OUTPUT STRUCTURE:
{
  "parents": [
    {
      "parent": { ...all required parent fields... },
      "children": [ ...child dimension cards... ]
    }
  ]
}

---

PARENT FIELDS:
Extract all fields you can from the text. Use null for anything not mentioned. Do not invent.

- title              : short descriptive title for this experience
- normalized_role    : standardized role name (e.g. "Software Engineer", "Freelance Plumber", "Family Business Owner")
- domain             : broad domain (e.g. "Engineering", "Finance", "Trades", "Education", "Informal Trade")
- sub_domain         : more specific area if present (e.g. "Backend", "Tax Law", "Electrical", "Street Vending")
- company_name       : organization, employer, client, institution, or family business name. null if independent/informal.
- company_type       : MUST be one of: {{COMPANY_TYPE_ENUM}}
- team               : team or department name if mentioned
- location           : object with fields:
    - city            : city name or null
    - region          : state/region or null
    - country         : country or null
    - text            : user's original location phrasing or null
    - is_remote       : true if explicitly remote, false if explicitly on-site, null if not mentioned
- employment_type    : MUST be one of: {{EMPLOYMENT_TYPE_ENUM}}
- start_date         : YYYY-MM or YYYY-MM-DD only. No month names. null if unknown.
- end_date           : YYYY-MM or YYYY-MM-DD only. null if ongoing or unknown.
- is_current         : true if this is their current engagement, else false
- summary            : 2–4 sentence summary of what they did and why it mattered
- intent_primary     : MUST be one of: {{INTENT_ENUM}}
- intent_secondary   : list of additional intents from the same enum, or []
- seniority_level    : MUST be one of: {{SENIORITY_LEVEL_ENUM}}. null if unclear.
- raw_text           : verbatim excerpt from the cleaned text for THIS experience only
- confidence_score   : float 0.0–1.0 reflecting how complete and clear the extracted data is
- relations          : always [] — populated in a later step after all cards are extracted

---

COMPANY TYPE GUIDANCE:
- Person runs their own shop / street stall / informal trade → "informal"
- Person works in parent's or family's business → "family_business"
- Person learned a trade under a master or ustaad → "master_apprentice"
- Person is fully independent with no org → "self_employed"

---

CHILDREN:
Extract child dimension cards for every distinct dimension the experience mentions.
Allowed child_type values: {{ALLOWED_CHILD_TYPES}}

Child format — each child has: child_type, value: { raw_text, items[] }

Rules:
1. Create ONE child per child_type. Group all same-type evidence into ONE child with many items.
2. Do NOT create multiple children of the same child_type for the same parent.
3. value.items is an array. Each item: { "title": "short label", "description": "one line" or null }
4. Add as many items as needed per child. Example: metrics child can have "₹15 lakh sales" / "Generated in 2 months" AND "20 active partners" / "Built through collaborations."
5. value.raw_text: verbatim excerpt for this child only.
6. Prefer short, human-readable titles. Prefer one-line descriptions.
7. Do NOT output rigid nested schemas (actions, outcomes, tooling) inside value — use items[] only.
8. Do NOT invent facts. Use only grounded evidence.
9. Do NOT create children that merely restate the parent summary.
10. Do NOT include a top-level "label" field on children — it is not stored.

Examples:
{
  "child_type": "tools",
  "value": {
    "raw_text": "verbatim excerpt for this child only",
    "items": [
      { "title": "Python", "description": "Used for backend services." },
      { "title": "Bloomberg API", "description": null }
    ]
  }
}

- metrics: items: [
    { "title": "₹15 lakh sales", "description": "Generated in 2 months." },
    { "title": "20 active partners", "description": "Built through Mumbai studio collaborations." }
  ]
- collaborations: items: [{ "title": "Studio partnerships", "description": "Mediated across Mumbai." }]

---

GLOBAL RULES:
- Extract ONLY the {{EXPERIENCE_INDEX}}-th experience. Ignore all others.
- Do NOT invent facts. If a field is absent from the text, use null or [].
- Dates MUST be YYYY-MM or YYYY-MM-DD. Never use "Jan", "January", or natural language dates.
- raw_text in parent must be a verbatim excerpt from the cleaned text for this experience only.
- relations must always be [] — do not attempt to link cards during extraction.
- Return ONLY valid JSON. No markdown, no commentary, no preamble.

---

CLEANED TEXT:
{{USER_TEXT}}

Extract ONLY the {{EXPERIENCE_INDEX}}-th experience (of {{EXPERIENCE_COUNT}}). Return valid JSON only:
"""


# -----------------------------------------------------------------------------
# 3. Fill missing fields only (no full extract; for edit-form "Update from messy text")
# -----------------------------------------------------------------------------

PROMPT_FILL_MISSING_FIELDS = """You are a targeted field-filling extractor. Your only job is to find values for fields that are currently empty. You do not rewrite, summarize, or create new cards.

---

INPUTS:
1. Current card (JSON) — fields that are null, "", or [] are considered missing.
2. Cleaned text — the source you must extract from.
3. Allowed keys — the only keys you may return.

---

TASK:
Read the cleaned text and extract values ONLY for fields that are missing in the current card.
{{ITEMS_INSTRUCTION}}

---

RULES:
1. Do NOT overwrite or modify fields that already have a value in the current card.
2. Only return keys listed in allowed_keys. Ignore everything else.
3. Only return keys you can confidently fill from the text. Omit keys you cannot infer.
4. Do NOT invent or guess. If the text doesn't say it, leave the key out.
5. Dates MUST be YYYY-MM or YYYY-MM-DD only. Never use month names or natural language.
6. For array fields (e.g. intent_secondary), return a JSON array of strings.
7. Return a single flat JSON object. No markdown, no commentary, no array wrapper, no nesting.

---

ALLOWED KEYS (return only these):
{{ALLOWED_KEYS}}

---

CURRENT CARD (do not touch fields that already have values):
{{CURRENT_CARD_JSON}}

---

CLEANED TEXT (extract from this only):
{{CLEANED_TEXT}}

Return valid JSON only:
"""

# Instruction injected into PROMPT_FILL_MISSING_FIELDS when card_type=child (for items append).
FILL_MISSING_ITEMS_APPEND_INSTRUCTION = (
    "For items: extract achievements, metrics, or details from the cleaned text. "
    "If the current card already has items, also extract any ADDITIONAL achievements from the text "
    "and return them as new items to append. Return items as: "
    '[{"subtitle": "short title", "sub_summary": "description"}] or [{"title": "...", "description": "..."}]. '
    "Return ONLY the new items to add (not existing ones), so the frontend can append them."
)

# -----------------------------------------------------------------------------
# 4. Helper: fill_prompt
# -----------------------------------------------------------------------------

_DEFAULT_REPLACEMENTS: dict[str, str] = {
    "{{INTENT_ENUM}}": INTENT_ENUM,
    "{{ALLOWED_CHILD_TYPES}}": ALLOWED_CHILD_TYPES_STR,
    "{{COMPANY_TYPE_ENUM}}": COMPANY_TYPE_ENUM,
    "{{EMPLOYMENT_TYPE_ENUM}}": EMPLOYMENT_TYPE_ENUM,
    "{{SENIORITY_LEVEL_ENUM}}": SENIORITY_LEVEL_ENUM,
}


def fill_prompt(
    template: str,
    *,
    user_text: str | None = None,
    cleaned_text: str | None = None,
    current_card_json: str | None = None,
    allowed_keys: str | None = None,
    experience_index: int | None = None,
    experience_count: int | None = None,
    items_instruction: str | None = None,
) -> str:
    kwargs_map = {
        "{{USER_TEXT}}": user_text,
        "{{CLEANED_TEXT}}": cleaned_text,
        "{{CURRENT_CARD_JSON}}": current_card_json,
        "{{ALLOWED_KEYS}}": allowed_keys,
        "{{EXPERIENCE_INDEX}}": experience_index,
        "{{EXPERIENCE_COUNT}}": experience_count,
        "{{ITEMS_INSTRUCTION}}": items_instruction or "",
    }
    out = template
    for placeholder, value in _DEFAULT_REPLACEMENTS.items():
        out = out.replace(placeholder, value)
    for placeholder, value in kwargs_map.items():
        if value is not None:
            out = out.replace(placeholder, value if isinstance(value, str) else str(value))
    return out
