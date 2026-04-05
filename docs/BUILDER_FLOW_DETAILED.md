# Builder Flow Detailed Reference

This document explains the current Builder flow end-to-end: how conversation turns become structured experience cards, which prompts run, which schemas are used, and when persistence/embedding happen.

---

## 1) High-Level Architecture

Builder is a **conversation-first pipeline** with two phases:

1. **Conversation phase** (chat/voice):
   - Keep grounded story context in runtime memory while the conversation is active.
   - Keep the user experience natural (no visible schema form-filling).

2. **Projection phase** (commit/extract):
   - Synthesize transcript into extraction input.
   - Detect distinct experiences.
   - Extract one experience at a time into parent + child card family.
   - Persist to `experience_cards` + `experience_card_children`.
   - Finalize/visibility + embeddings.

Core backend files:
- `apps/api/src/routers/builder.py`
- `apps/api/src/services/builder/engine.py`
- `apps/api/src/services/builder/roles.py`
- `apps/api/src/prompts/builder_conversation.py`
- `apps/api/src/services/experience/pipeline.py`
- `apps/api/src/prompts/experience_card.py`
- `apps/api/src/schemas/builder.py`
- `apps/api/src/db/models.py`

Core frontend file:
- `apps/web/src/components/builder/chat/builder-chat.tsx`

---

## 2) Data Model Schemas (DB)

### 2.1 Builder session state (runtime-only)

Builder no longer persists conversation-memory tables in Postgres.

Current behavior:
- `session_id` still exists and is returned to frontend.
- turn history + status (`discovering/deepening/ready_to_commit/committed`) are kept in backend runtime memory.
- hidden-memory payload is not persisted by backend (Vapi assistant memory is the source of truth).

Implication:
- restarting the API process clears active Builder session memory.
- committed cards remain persisted normally.

### 2.2 Card tables

#### `experience_cards` (parent)
Important fields:
- identity: `id`, `person_id`
- semantics: `title`, `normalized_role`, `domain`, `sub_domain`
- org/work context: `company_name`, `company_type`, `team`
- time/location: `start_date`, `end_date`, `is_current`, `location`, `city`, `country`, `is_remote`
- profile signal: `summary`, `intent_primary`, `intent_secondary`, `seniority_level`
- confidence: `confidence_score`
- visibility + search: `experience_card_visibility`, `embedding`

#### `experience_card_children` (dimension cards)
Important fields:
- identity: `id`, `parent_experience_id`, `person_id`
- dimension: `child_type`
- payload: `value` JSONB with shape:
  - `{ raw_text, items: [{ title, description }] }`
- `confidence_score`, `embedding`
- unique `(parent_experience_id, child_type)`

---

## 3) API Schemas (Pydantic Contracts)

Defined in `apps/api/src/schemas/builder.py`.

### 3.1 Conversation endpoints

#### `BuilderChatTurnRequest`
- `session_id?: str`
- `person_id?: str` (optional; server uses auth person)
- `message: str`
- `mode: "text" | "voice"` (default `"text"`)

#### `BuilderChatTurnResponse`
- `session_id: str`
- `assistant_message: str`
- `working_narrative?: str`
- `surfaced_insights: string[]`
- `should_continue: bool`
- `session_status: str`
- `ready_to_commit: bool`
- `extract_schema_queued: bool`

#### `BuilderSessionResponse`
- session metadata + current turn stream:
  - `mode`, `session_status`, `current_focus`, `working_narrative`
  - `turn_count`, `stop_confidence`
  - `surfaced_insights`, `should_continue`, `ready_to_commit`
  - `turns: BuilderTurnResponse[]`

#### `BuilderSessionCommitResponse`
- `session_id`, `session_status`, `working_narrative`
- `committed_card_ids[]`
- `committed_card_count`

### 3.2 Card endpoints

#### `ExperienceCardCreate`, `ExperienceCardPatch`
- optional normalized parent fields
- location validator normalizes `str`/`dict` to DB string

#### `ExperienceCardResponse`
- parent card DTO

#### `ExperienceCardChildPatch`
- `items?: list[dict]`

#### `ExperienceCardChildResponse`
- `id`, `parent_experience_id`, `child_type`, `items[]`

#### `FillFromTextRequest` / `FillFromTextResponse`
- helper endpoint to fill only missing fields from messy input.

---

## 4) HTTP Endpoints and Responsibilities

From `apps/api/src/routers/builder.py`.

### 4.1 Conversation-first endpoint
- `POST /builder/transcript/commit`
  - Vapi-first path: commit one completed transcript in a single request.
  - Used by frontend when voice call ends.

### 4.2 Card finalize + CRUD endpoints
- `POST /experience-cards/finalize`
  - Marks card visible and embeds parent + children.

- `POST /experience-cards`
  - Manual parent creation.

- `PATCH /experience-cards/{card_id}`
  - Parent patch + re-embed.

- `PATCH /experience-card-children/{child_id}`
  - Child patch + re-embed.

- delete endpoints for parent/child.

### 4.3 Fill helper
- `POST /experience-cards/fill-missing-from-text`
  - Runs targeted missing-field extraction.
  - If parent `card_id` provided, merges and persists parent patch + re-embed.

---

## 5) Prompt Inventory (Each Prompt and Purpose)

## A) Conversation prompts (`builder_conversation.py`)

### A1. `build_fast_turn_prompt(...)`
Single-call turn brain used by `fast_turn()` in `roles.py`.

Inputs:
- current `working_narrative`
- recent `visible_turns`
- `turn_count`
- `mode` (text/voice)

Output JSON contract expected from LLM:
- `working_narrative`
- `stop_decision` (`should_stop`, `ready_to_commit`, reasoning)
- `assistant_message`
- `message_type` (`reflection|question|summary|stop`)

Behavioral guardrails in prompt:
- natural, human tone
- one-experience lock
- anti-loop questioning
- minimal question budget
- strict no schema extraction in this step
- voice-specific anti-repetition and transcript-noise handling

### A2. `build_commit_synthesis_prompt(...)`
Used by `synthesize_commit_input()` to produce an internal extraction-friendly narrative.

Output JSON:
- `{ "extraction_input": "..." }`

Purpose:
- Convert transcript + working narrative into grounded prose optimized for downstream extraction.

## B) Extraction pipeline prompts (`experience_card.py`)

### B1. `PROMPT_REWRITE`
- Cleans raw text into parse-friendly text.
- Must preserve meaning and facts exactly.

### B2. `PROMPT_DETECT_EXPERIENCES`
- Returns `count + experiences[]` with exactly one `suggested: true`.

### B3. `PROMPT_EXTRACT_SINGLE_CARDS`
- Extracts exactly one selected experience (`experience_index` of `experience_count`).
- Returns `parents: [{ parent, children[] }]`.
- Parent has normalized fields (title, role, domain, company, dates, summary, intents, seniority, confidence, raw_text, relations[]).
- Children use `child_type` + `value.raw_text` + `value.items[]`.

### B4. `PROMPT_FILL_MISSING_FIELDS`
- Targeted extraction only for missing keys.
- Never overwrite filled fields.

### B5-B7. Clarify prompts
- `PROMPT_CLARIFY_PLANNER`
- `PROMPT_CLARIFY_QUESTION_WRITER`
- `PROMPT_CLARIFY_APPLY_ANSWER`

Note:
- Clarify flow still exists in pipeline module, but the current Builder conversation-first path primarily uses chat turns + commit extraction flow.

### B8. `PROMPT_PROFILE_REFLECTION`
- Optional short person-level reflection extraction.

### B9. `fill_prompt(...)`
- Shared placeholder injector for all prompt templates.

---

## 6) Engine Flow in Detail (Backend Runtime)

From `apps/api/src/services/builder/engine.py`.

### Step 1: Receive a user message
`process_builder_turn(...)`:
1. Normalizes duplicate adjacent transcript phrases.
2. Loads existing or creates new in-memory session (`_load_session_with_state`).
3. Appends user turn.
4. Loads visible turns.

### Step 2: Generate next assistant turn
5. Calls `fast_turn(...)`:
   - builds fast-turn prompt
   - calls chat provider
   - parses/coerces JSON fields safely
6. If LLM call fails, fallback chain runs:
   - `fallback_stop_decision`
   - `fallback_director`
   - `fallback_reply`

### Step 3: Persist conversation state
7. Persists:
   - in-memory `session.working_narrative`
8. Appends assistant visible turn.
9. Computes status:
    - `discovering` (early)
    - `deepening` (>=4 turns)
    - `ready_to_commit` (stop-ready)
10. Returns turn response with `ready_to_commit`.

### Step 4: Trigger extraction
- Frontend sends full transcript once to `POST /builder/transcript/commit` when call ends.

### Step 5: Commit/extract to cards
`commit_builder_session(...)`:
1. Load in-memory session + turns.
2. Build `visible_turns` payload.
3. Try `synthesize_commit_input(...)`.
4. Fallback to narrative + user turn concatenation if synthesis empty.
5. Run `detect_experiences(extraction_input)`.
6. Determine `experience_count` (minimum 1).
7. Loop `experience_index = 1..count`:
   - `run_draft_single(...)`
   - finalize each parent (`_finalize_card`): set visibility true + embed parent/children
8. Set session status to `committed`.
9. Return committed card IDs/count and serialized cards/children.

---

## 7) Card Creation Flow (Projection Internals)

From `apps/api/src/services/experience/pipeline.py`.

For each experience index:
1. `rewrite_raw_text(raw_text)` via `PROMPT_REWRITE` (cached by SHA-256 key).
2. Build extract prompt `PROMPT_EXTRACT_SINGLE_CARDS` with index/count.
3. LLM extraction call.
4. Parse/validate/normalize response (`parse_llm_response_to_families` path).
5. Inject metadata.
6. Persist family via `persist_families(...)`:
   - parent -> `experience_cards`
   - children -> `experience_card_children`
7. Return serialized family payload.

Visibility/embedding behavior:
- `run_draft_single` intentionally does not embed immediately.
- Builder commit finalization makes cards visible and embeds.

---

## 8) Frontend Runtime Flow (`builder-chat.tsx`)

### 8.1 Session bootstrap and persistence
- Restores chat UI state from `sessionStorage`.
- Restores server session by `GET /builder/session/{session_id}` when available.
- Stores:
  - `builder-session-id`
  - `builder-chat-state` (messages + surfaced insights)

### 8.2 Text turn flow
On send:
1. Add local user bubble.
2. Add local assistant acknowledgment bubble.
3. No backend turn call is made; extraction happens from the final voice transcript commit.

### 8.3 Voice flow
- Uses Vapi client wrappers from `vapi-client`.
- Auto-starts voice on `/builder`.
- Merges transcript chunks into streaming user/assistant bubbles.
- Detects assistant wrap-up transcript and auto-ends call.
- On call end, sends full transcript once to `POST /builder/transcript/commit`.
- Voice scope is forced to `/builder` route.

---

## 9) Status and State Machine

Session status progression:
- `discovering` -> `deepening` -> `ready_to_commit` -> `committed`

`should_continue` semantics:
- `false` when status is `ready_to_commit` or `committed`
- frontend uses this plus `ready_to_commit` to stop questioning and transition to save/poll flow

Background extract job states:
- `running`
- `completed`
- `failed`
- fallback `not_started`

---

## 10) What Actually Makes a Card "Appear"

A card becomes visible/searchable only after:
1. Extraction persisted card rows.
2. Finalization sets `experience_card_visibility = true`.
3. Embedding runs for parent and children.

If extraction succeeds but finalize/embedding fails, card persistence can exist without normal search visibility.

---

## 11) Practical Debug Checklist

If Builder chat works but no cards appear:
- Check `POST /builder/transcript/commit` request/response in network logs.
- Check whether committed card IDs were returned.
- Verify `experience_card_visibility` on committed parents.
- Verify embeddings are present for parent/children.

If assistant loops questions:
- Inspect `build_fast_turn_prompt` anti-loop rules.
- Inspect turn_count and stop_decision payload.

If extraction quality is weak:
- Inspect synthesized `extraction_input`.
- Compare detected experience count vs actual story threads.
- Inspect `PROMPT_EXTRACT_SINGLE_CARDS` output validity and parser normalization.

---

## 12) Summary

The new Builder path is intentionally split:
- **Conversation quality first** (natural, one-thread, low-friction, fast stop).
- **Schema extraction second** (structured projection after conversation is complete).

This decoupling keeps UX human while still producing normalized parent/child cards for search and profile workflows.

