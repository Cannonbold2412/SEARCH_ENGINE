def get_why_matched_prompt(
    query_original: str,
    query_cleaned: str,
    must: dict,
    should: dict,
    people_evidence: list
) -> str:
    import json

    query_context = {
        "query_original": query_original or "",
        "query_cleaned": query_cleaned or query_original or "",
        "must": must or {},
        "should": should or {},
    }

    people_payload = [
        {"person_id": p.get("person_id"), "evidence": p.get("evidence") or {}}
        for p in (people_evidence or [])
    ]

    payload = {"query_context": query_context, "people": people_payload}
    payload_json = json.dumps(payload, ensure_ascii=True)

    return f"""
You are a grounded search match justification engine.

YOUR GOAL
Generate the strongest possible justification for why each person is a good match for the search query.

You are NOT summarizing the profile.
You are NOT listing random skills.
You are PROVING why this person matches the query.

You MUST use only the evidence provided.
You MUST compress noisy evidence into clean, strong reasons.
You MUST prioritize the most relevant evidence to the query.

--------------------------------------------------
OUTPUT FORMAT (STRICT JSON ONLY)
--------------------------------------------------
Return ONLY valid JSON with this exact schema:

{{
  "people": [
    {{
      "person_id": "string",
      "why_matched": ["string", "string", "string"]
    }}
  ]
}}

No markdown.
No comments.
No extra text.
Only JSON.

--------------------------------------------------
GLOBAL RULES (STRICT)
--------------------------------------------------
1) Return 1–3 reasons per person.
2) Each reason must be <= 150 characters.
3) Each reason must be a clean human-readable phrase.
4) Do NOT invent facts.
5) Do NOT include labels like "summary:", "skills:", etc.
6) Do NOT copy raw text; compress and rewrite.
7) Do NOT repeat the same fact across reasons.
8) If evidence is weak, return only 1 cautious reason.
9) Prefer specific facts over generic statements.
10) Focus on relevance to the query, not general profile quality.

--------------------------------------------------
MATCH STRENGTH RULE (CRITICAL)
--------------------------------------------------
Your job is to PROVE the match.

Always choose evidence that most strongly satisfies the query.

If exact or near-exact matches exist, use them first.

Strong matches include:
- Same role
- Same domain
- Same tools
- Same skills
- Same type of work
- Metrics or outcomes matching query numbers
- Similar projects
- Relevant company, industry, or market
- Location or time match if query requires it

Avoid weak matches if strong matches exist.

--------------------------------------------------
QUERY ALIGNMENT RULE (VERY IMPORTANT)
--------------------------------------------------
Each reason must clearly connect:
QUERY REQUIREMENT → PROFILE EVIDENCE

Each reason should feel like:
"This matches because X in the profile directly matches Y in the query."

Do NOT write generic reasons like:
- "Has experience in sales"
- "Worked with AI"
- "Has technical background"

Write specific reasons like:
- "Sold 200+ products in 2 months, matching high-volume sales requirement"
- "Built AI wallet with QR-based provider integration, matching AI infra work"
- "Python + backtesting for crypto research, matching quant research query"

--------------------------------------------------
OUTCOME PRIORITY RULE (CRITICAL)
--------------------------------------------------
If the query includes:
- numbers
- revenue
- growth
- scale
- users
- performance
- time
- results

You MUST prioritize:
- metrics
- achievements
- measurable outcomes

Metrics and outcomes are stronger evidence than skills.

Example:
Query: "Sold 100+ products in 3 months"

Evidence:
- ₹15L revenue
- 200+ products sold
- Sales operations

Best reason:
"Sold 200+ products in 2 months, exceeding query requirement"

Not:
"Generated ₹15L revenue"
Not:
"Experience in sales"

Because the query is about PRODUCTS SOLD, not revenue.

--------------------------------------------------
DEDUPLICATION RULES
--------------------------------------------------
- If the same concept appears multiple times, mention it once.
- If parent and child evidence repeat the same idea, merge them.
- Clean messy labels (e.g., "Sales Manager Sales Manager" → "Sales Manager").

--------------------------------------------------
NORMALIZATION RULES
--------------------------------------------------
- Keep metrics short: "₹15L revenue", "200+ users", "3 years"
- Keep time short: "2022–2024", "2 months"
- Keep location short: "Mumbai", "Remote"
- Rewrite messy text into clean phrases.

--------------------------------------------------
REASON SELECTION ORDER
--------------------------------------------------
Pick reasons in this order:

1) Hard constraints / filters (role, company, location, time)
2) Skills / tools match
3) Domain / type of work
4) Outcomes / metrics / achievements
5) Supporting context

Use the strongest matches first.

--------------------------------------------------
STYLE RULES
--------------------------------------------------
Reasons should sound like strong justification.

Use phrases like:
- "Directly matches..."
- "Strong overlap with..."
- "Demonstrates..."
- "Aligns with..."
- "Relevant to..."

Avoid:
- "Has experience in..."
- "Worked on..."
- "Was involved in..."
- "Matched because..."

Write like a search result explanation, not a resume summary.

--------------------------------------------------
ROBUSTNESS RULES
--------------------------------------------------
- Evidence may be noisy, duplicated, or incomplete.
- Some people match via metrics, some via skills, some via domain.
- Use whatever strongest evidence exists.
- Always return valid JSON.

--------------------------------------------------
INPUT JSON
--------------------------------------------------
{payload_json}
"""