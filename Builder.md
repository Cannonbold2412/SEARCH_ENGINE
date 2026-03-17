## Builder – End‑to‑End Flow

This document explains **how the Builder works from user prompt (text or voice) all the way to persisted experience card schemas and embeddings**. It focuses on:

- **Frontend:** `builder/page.tsx`, `BuilderChat`, voice / sphere UX
- **API layer:** `src/routers/builder.py` and `src/schemas/builder.py`
- **Pipeline core:** `src/services/experience/pipeline.py` (+ clarify helpers, prompts)

The goal is that you can change any part (UI, prompts, pipeline, DB) and still reason about the whole system.

---

## 1. High‑Level Architecture

- **User input**
  - **Typed text** in the Builder page
  - **Real‑time voice** via Vapi (optional; mapped to the same text pipeline by the convai adapter)
- **Frontend Builder logic (`BuilderChat`)**
  - Maintains a **stage machine**: `awaiting_experience → awaiting_choice → clarifying → done`
  - Calls **Builder API endpoints** for:
    - Detecting experiences
    - Drafting a single card family (parent + children)
    - Clarifying / filling missing fields
    - Finalizing a card into the persistent schema
- **Backend builder router**
  - Thin HTTP layer that:
    - Validates request bodies with **Pydantic schemas**
    - Delegates to **pipeline functions** (rewrite, detect, draft, clarify, fill‑missing)
    - Persists cards via services and **re‑embeds** them for search
- **Experience pipeline (`pipeline.py`)**
  - Orchestrates:
    1. **Rewrite** messy input → clean English
    2. **Detect** discrete experiences within a long narrative
    3. **Extract** a single experience → **Card families** (parent + children)
    4. **Validate & normalize** into internal card structures
    5. **Clarify** missing information with iterative LLM loops
    6. **Persist + embed** to DB + vector store

---

## 2. Frontend: Builder Entry Point

### 2.1 `apps/web/src/app/(authenticated)/builder/page.tsx`

- This page is a **thin client wrapper** around `BuilderChat`:
  - Defines `translateToEnglishForBackend(text)`:
    - Currently a **no‑op**: trims the text and returns it.
    - Hook point if you ever want to **translate the UI language to English** for backend prompts.
  - Renders:
    - A page title (`Builder`)
    - A full‑height container with `<BuilderChat translateRawText={translateToEnglishForBackend} />`

So **all Builder behaviour** is inside `BuilderChat`.

---

## 3. Frontend: `BuilderChat` Flow

### 3.1 Core Types and State

Key types:

- **ChatMessage**
  - `id`: string
  - `role`: `"assistant" | "user"`
  - `content`: string
  - `card?`: `DraftCardFamily` (parent + children, from API)

- **Stage**
  - `"awaiting_experience"` – waiting for the user to describe one or more experiences
  - `"awaiting_choice"` – multiple experiences detected; waiting for user to choose one
  - `"clarifying"` – iterative Q&A to fill missing fields
  - `"card_ready"` – (not heavily used; effectively part of “done”)
  - `"idle"` – fallback / unused state

- **ClarifyHistoryEntry**
  - Mirrors backend `ClarifyHistoryMessage` with:
    - `role`, `kind` (`clarify_question | clarify_answer`), `target_type`, `target_field`,
      `target_child_type`, `profile_axes`, `text`
  - This is passed back to the backend so the clarify flow can **track which field** each Q&A refers to.

Main React state inside `BuilderChat`:

- `messages: ChatMessage[]` – chat transcript (user + assistant + card payloads)
- `stage: Stage` – current builder stage
- `input: string` – textarea content
- `loading: boolean` – whether we are waiting on an API call
- `loadingFirstMessage: boolean` – shows a spinner for the very first assistant message
- `detectedExperiences: DetectExperiencesResponse | null`
- `currentExperienceText: string` – raw text of the multi‑experience narrative from the user
- `currentCardFamily: DraftCardFamily | null` – card family in progress
- `clarifyHistory: ClarifyHistoryEntry[]` – Q&A sequence for clarify flow
- **Voice state**:
  - `vapiRef`, `voiceConnecting`, `voiceConnected`, `aiSpeaking`, `userSpeaking`, `voiceError`
  - These drive the **AiSphere** and voice UX.

### 3.2 Initial Assistant Question (LLM‑driven)

On mount:

1. `useEffect` immediately POSTs to:
   - `POST /experience-cards/clarify-experience` with:
     - `raw_text: ""`
     - `current_card: {}`
     - `card_type: "parent"`
     - `conversation_history: []`
2. The backend clarify pipeline uses a **planner prompt** to produce a **warm‑up question**:
   - If it returns `clarifying_question`, that string becomes the first assistant message.
   - If not, fallback copies:
     - A gentle question about “things you've worked on or cared about lately”.
     - Or a “coffee chat” style fallback if the request fails entirely.
3. `loadingFirstMessage` is toggled off when the call completes.

This means the **very first thing the user sees** is either:

- An LLM‑generated, profile‑aware opener, or
- A curated fallback text.

### 3.3 Voice UX: `AiSphere` and Vapi

`BuilderChat` integrates real‑time voice:

- **Sphere state**:
  - `sphereActive` derived from `voiceConnecting`, `aiSpeaking`, `userSpeaking`, `voiceConnected`
  - `sphereIntensity` increased when AI or user is speaking
  - Feeds into `<AiSphere intensity active onClick={toggleVoice} />`
- **`toggleVoice` callback**:
  1. If `voiceConnected`: calls `vapiRef.current.stop()` and cleans up.
  2. Otherwise:
     - Reads auth token from `localStorage[AUTH_TOKEN_KEY]`.
     - Asserts `API_BASE` is configured.
     - **Lazy imports** `@vapi-ai/web`, constructs `new Vapi(token, proxyBase)`, where:
       - `proxyBase = ${API_BASE}/convai`
       - The **convai router** proxies Vapi traffic and hosts the voice assistant config.
     - Registers Vapi event handlers:
       - `call-start` → mark connected
       - `call-end` → mark disconnected, invalidate experience card families
       - `speech-start` / `speech-end` → drive `aiSpeaking`/`userSpeaking`
       - `message` → append **transcript messages** into `messages` with `role` and `content`
       - `error` → show a **friendly tunnel / callback URL hint** on local dev
     - Calls `vapi.start({})` to begin the call.

**Important:** Voice transcript messages surface in the same `messages` array as typed messages, **but they do not automatically trigger the detect/draft/clarify pipeline** – that is still driven by **user text submissions** in the Builder textarea. Voice is more of a conversational surface (plus convai‑side profile building).

### 3.4 Submitting Text: `sendMessage`

`sendMessage` is the **core orchestrator** on the frontend. It:

1. Reads `text = input.trim()` (or `overrideText`) and early‑returns if empty or `loading`.
2. Resets `input`, appends a user `ChatMessage`.
3. Branches on **`stage`**:

#### 3.4.1 Stage: `awaiting_experience`

User has just described **one or more experiences** in free‑form text.

Steps:

1. Save `currentExperienceText = text`.
2. Set `loading = true`.
3. Translate to English: `english = await translateRawText(text)` (currently no‑op).
4. Call **Detect**:
   - `POST /experience-cards/detect-experiences` with:
     - `raw_text: english || text`
5. Handle `DetectExperiencesResponse`:
   - `count === 0` or `experiences.length === 0`:
     - Assistant replies with a clarifying “where were you / what were you responsible for?” question.
     - Remains in `awaiting_experience`.
   - `count === 1`:
     - Call `extractSingle(1, 1, text)` → `DraftSetResponse` → `DraftCardFamily`.
     - If extraction fails:
       - Ask the user for more detail / when & where.
       - Stay in `awaiting_experience`.
     - If extraction succeeds:
       1. `currentCardFamily = family`, `clarifyHistory = []`.
       2. Build a **human‑readable summary** from parent fields (title, company, dates, summary).
       3. Assistant message:
          - “Here’s how I’d describe what you did…” with bolded summary.
       4. Call **Clarify**:
          - `askClarify(family, [], { rawTextOverride: text })`
       5. Now branch on the clarify result (see **3.5 Clarify loop** below).
   - `count > 1`:
     - Save `detectedExperiences = { count, experiences }`.
     - Call `askClarify(null, [], { detectedExperiences: experiences, rawTextOverride: text })`.
     - If response has `action === "choose_focus"` and `message`:
       - Build a numbered list from `options` or the raw experiences.
       - Assistant message with instructions to “Reply with the number to pick one.”
     - Else:
       - Use a generic “I found N experiences” message with numbered list.
     - Set `stage = "awaiting_choice"`.

#### 3.4.2 Stage: `awaiting_choice`

User is replying with a **number** to pick which detected experience to build a card from.

Steps:

1. Parse integer from `text` (`parseInt(text.replace(/\D/g, ""), 10)`).
2. Look up `exp` in `detectedExperiences.experiences`.
3. If invalid:
   - Ask user again to “reply with the number”.
   - Stay in `awaiting_choice`.
4. If valid:
   - Clear `detectedExperiences`, set `loading = true`.
   - Call `extractSingle(exp.index, detectedExperiences.count, currentExperienceText)`.
   - If fails:
     - Ask for more details (“where you were and roughly when…”).
     - Reset to `awaiting_experience`.
   - If succeeds:
     1. Same pattern as the single‑experience case:
        - Assistant: “Here’s how I’d sum that up…”
        - Call `askClarify(family, [], { rawTextOverride: currentExperienceText })`.
     2. Then follow the **clarify result** branches described below.

#### 3.4.3 Stage: `clarifying`

We are in an **iterative Q&A loop** with the LLM to fill missing card fields.

Steps:

1. Build a `ClarifyHistoryEntry` for the user answer:
   - `{ role: "user", kind: "clarify_answer", text }`
2. Append to `clarifyHistory`.
3. Call `askClarify(currentCardFamily, history)`.
4. Handle result:
   - If `clarifying_question` present:
     - Optionally update `currentCardFamily` from `canonical_family`.
     - Append `asked_history_entry` (or reconstructed entry) to `clarifyHistory`.
     - Add `profile_reflection` as a separate assistant message if present.
     - Add the new question as an assistant chat message.
     - Stay in `clarifying`.
   - Else if `should_stop` or non‑empty `filled`:
     - Merge `filled` into `currentCardFamily.parent` via `mergeFilledIntoCard`.
     - Clear `clarifyHistory`.
     - Call `/experience-cards/finalize` with `card_id` from merged parent.
     - Invalidate queries (`EXPERIENCE_CARDS_QUERY_KEY`, `EXPERIENCE_CARD_FAMILIES_QUERY_KEY`).
     - Build a `finalFamily` object and send an assistant message with:
       - Completion copy (“Your experience card is ready…”) and
       - `card: finalFamily` attached, so UI can show a preview card.
     - `currentCardFamily = null`, `stage = "awaiting_experience"`.
   - Else (no more questions, no filled fields):
     - Finalize using the current `currentCardFamily` without additional merge.
     - Similar success message and card preview.
     - Reset state and stage as above.

In all branches, `loading` is toggled around the async call.

---

## 4. Frontend: How API Requests Are Built

### 4.1 `extractSingle`

Called when we know **which single experience** we want:

- Endpoint: `POST /experience-cards/draft-single`
- Body (`DraftSingleRequest`):
  - `raw_text`: `english || text`
  - `experience_index`: 1‑based index of selected experience
  - `experience_count`: total number from detect‑experiences
- Response (`DraftSetResponse`):
  - `draft_set_id`
  - `raw_experience_id`
  - `card_families: DraftCardFamily[]` (usually length 1)
- Frontend behaviour:
  - Takes `families[0]` → saves as `currentCardFamily`.
  - Builds summary with `buildSummaryFromParent`.

### 4.2 `askClarify`

Central helper to call the clarify endpoint:

- Endpoint: `POST /experience-cards/clarify-experience`
- Body (`ClarifyExperienceRequest`) roughly:
  - `raw_text`: translated `currentExperienceText` (or override)
  - `card_type`: `"parent"` (for Builder)
  - `current_card`: `cardFamily?.parent` or `{}` if we’re only choosing focus
  - `conversation_history`: simple `[ { role, content } ]` derived from `ClarifyHistoryEntry[]`
  - `card_family`: `{ parent, children }` when a family exists
  - `asked_history`: full `clarifyHistory` as structured dicts
  - `last_question_target`: extracted from last assistant `clarify_question` entry
  - `card_id`: parent id when present (so backend can persist merges)
  - `detected_experiences`: optional list of `{ index, label }` for choose‑focus flows
- Response (`ClarifyExperienceResponse`):
  - `clarifying_question?: string`
  - `filled: Record<string, any>`
  - `profile_update?: { skills, knowledge_areas, … }`
  - `profile_reflection?: string`
  - `should_stop?: bool`
  - `stop_reason?: string`
  - `target_type`, `target_field`, `target_child_type`
  - `progress`, `missing_fields`, `asked_history_entry`, `canonical_family`, etc.

`askClarify` is used in three places:

1. **Opening prompt** (page mount) – to get a warm‑up question.
2. **After detection / extract** – to start the clarify loop for a new card.
3. **During clarify loop** – to consume user answers and produce next question or final filled/stop signal.

---

## 5. Backend: Builder Router (`src/routers/builder.py`)

The router exposes a **clean REST surface** that exactly matches the frontend’s needs.

### 5.1 Raw Experience

- `POST /experiences/raw`
  - Body: `RawExperienceCreate { raw_text }`
  - Persists a `RawExperience` for auditing / debugging (no AI).

### 5.2 Rewrite

- `POST /experiences/rewrite`
  - Body: `RawExperienceCreate`
  - Returns `RewriteTextResponse { rewritten_text }`
  - Uses `rewrite_raw_text(raw_text)` from `pipeline.py`
  - Not used by `BuilderChat` today but available for clients that want an explicit rewrite step.

### 5.3 Detect Experiences

- `POST /experience-cards/detect-experiences`
  - Body: `RawExperienceCreate`
  - Calls `detect_experiences(raw_text)` in `pipeline.py`
  - Response: `DetectExperiencesResponse { count, experiences[] }`
  - Used in **`awaiting_experience`** stage to compute experience choices.

### 5.4 Draft Single Experience

- `POST /experience-cards/draft-single`
  - Body: `DraftSingleRequest`
  - Calls `run_draft_single(db, user_id, raw_text, experience_index, experience_count)`
  - Returns `DraftSetResponse`:
    - Wraps pipeline’s families into `DraftCardFamily { parent: dict, children: dict[] }`
  - The **pipeline** handles:
    - Rewrite → extract → validate → persist → embed.

### 5.5 Fill Missing from Text

- `POST /experience-cards/fill-missing-from-text`
  - Body: `FillFromTextRequest` (manual edit‑form helper, not used by `BuilderChat`)
  - Calls `fill_missing_fields_from_text` in the pipeline.
  - If `card_id` and `card_type == "parent"`:
    - Merges `filled` into `current_card` via `merged_form` / `parent_merged_to_patch`.
    - Applies patch to `ExperienceCard`, flushes, and re‑embeds.

### 5.6 Clarify Experience

- `POST /experience-cards/clarify-experience`
  - Body: `ClarifyExperienceRequest`
  - Builds a simple `conv` for legacy compatibility:
    - `[{ role, content } for m in body.conversation_history]`
  - Computes `max_parent` / `max_child` from body or defaults.
  - Calls `clarify_experience_interactive(...)` from pipeline with:
    - `raw_text`, `current_card`, `card_type`
    - `conversation_history`, `card_family`, `asked_history_structured`
    - `last_question_target`, `max_parent`, `max_child`
    - `card_families`, `focus_parent_id`, `detected_experiences`
  - Post‑processing:
    - If `filled` and `card_id` for parent:
      - Merge, patch, flush, and re‑embed that card.
    - If `filled` and `child_id` for child:
      - Merge, patch, flush, and re‑embed that child.
  - Returns `ClarifyExperienceResponse`, passing through:
    - `clarifying_question`, `filled`, `profile_update`, `profile_reflection`,
      `action`, `message`, `options`, `focus_parent_id`, `should_stop`, etc.

**This endpoint is the backbone of the Builder UI:** it powers the **first question**, **experience selection guidance**, and **clarify loop**.

### 5.7 Finalize Experience Card

- `POST /experience-cards/finalize`
  - Body: `FinalizeExperienceCardRequest { card_id }`
  - Steps:
    1. Fetch card for current user.
    2. Set `experience_card_visibility = True`.
    3. Load all children for that parent.
    4. Call `_reembed_cards_after_update` with parent + children.
    5. Return `ExperienceCardResponse`.
  - On the frontend, this is called when:
    - Clarify loop is done, or
    - The pipeline decides the card is already good enough without further Q&A.

### 5.8 Manual CRUD

Additional endpoints exist for **manual experience card management** (outside the Builder chat flow):

- `POST /experience-cards` – manual create (`ExperienceCardCreate`)
- `PATCH /experience-cards/{card_id}` – manual patch (`ExperienceCardPatch`) + re‑embed
- `DELETE /experience-cards/{card_id}` – delete parent + children
- `PATCH /experience-card-children/{child_id}` – patch child items (`ExperienceCardChildPatch`)
- `DELETE /experience-card-children/{child_id}` – delete a child card

---

## 6. Backend: Builder Schemas (`src/schemas/builder.py`)

These Pydantic models are **the contract between frontend ↔ router ↔ pipeline**.

### 6.1 High‑Level Pipeline DTOs

- **RawExperienceCreate / RawExperienceResponse**
  - Simple “raw text blob + metadata” structures.

- **RewriteTextResponse**
  - `rewritten_text: str`

- **DraftCardFamily**
  - `parent: dict[str, Any]`
  - `children: list[dict[str, Any]]`
  - Represents the **flexible JSON view** of a card family directly from the pipeline.

- **DraftSetResponse**
  - `draft_set_id: str`
  - `raw_experience_id: str`
  - `card_families: list[DraftCardFamily]`

- **DetectedExperienceItem**
  - `index: int`, `label: str`, `suggested: bool`

- **DetectExperiencesResponse**
  - `count: int`, `experiences: DetectedExperienceItem[]`

- **DraftSingleRequest**
  - `raw_text: str`
  - `experience_index: int` (1‑based)
  - `experience_count: int` (total count from detect‑experiences)

### 6.2 Fill‑Missing Text

- **FillFromTextRequest**
  - `raw_text`
  - `card_type: "parent" | "child"`
  - `current_card: dict`
  - `card_id?: string` – if provided, persist merges on parent
  - `child_id?: string` – if provided, persist merges on child

- **FillFromTextResponse**
  - `filled: dict` – only the fields that were filled by the LLM.

### 6.3 Clarify Flow

- **ClarifyMessage**
  - `role`, `content` – simple transcript entries (legacy)

- **ClarifyHistoryMessage**
  - `role`, `kind`, `target_type`, `target_field`, `target_child_type`, `profile_axes`, `text`
  - Mirrors `ClarifyHistoryEntry` used in the UI, plus optional axes.

- **LastQuestionTarget**
  - `target_type`, `target_field`, `target_child_type`
  - Helps the pipeline correctly map the **next user answer**.

- **ClarifyExperienceRequest**
  - See section **4.2**: includes `raw_text`, `card_type`, `current_card`, `conversation_history`,
    `card_id`, `child_id`, `card_family`, `card_families`, `detected_experiences`,
    `focus_parent_id`, `asked_history`, `last_question_target`,
    `max_parent_questions`, `max_child_questions`.

- **ClarifyProgress**
  - Tracks how many questions have been asked vs. maxima.

- **ClarifyOption**
  - One “choose focus” option (`parent_id`, `label`).

- **ClarifyExperienceResponse**
  - Core fields consumed by the frontend:
    - `clarifying_question`
    - `filled`
    - `profile_update`
    - `profile_reflection`
    - `action` / `message` / `options` / `focus_parent_id`
    - `should_stop`, `stop_reason`
    - `target_type`, `target_field`, `target_child_type`
    - `progress`, `missing_fields`, `asked_history_entry`, `canonical_family`

### 6.4 Finalization and Persisted Schema

- **CommitDraftSetRequest**
  - For bulk commit flows (not used in BuilderChat).

- **FinalizeExperienceCardRequest**
  - `card_id: str` – card to make visible + embedded.

- **ExperienceCardBase / Create / Patch / Response**
  - Represent the **normalized persisted schema** for experience cards.
  - Common fields:
    - `title`, `normalized_role`, `domain`, `sub_domain`,
      `company_name`, `company_type`, `team`,
      `start_date`, `end_date`, `is_current`,
      `location` (normalized with `_location_to_str`),
      `is_remote`, `employment_type`,
      `summary`, `raw_text`,
      `intent_primary`, `intent_secondary`,
      `seniority_level`, `confidence_score`,
      `experience_card_visibility`.
  - Frontend primarily sees `ExperienceCardResponse` when:
    - Browsing “Your Cards”
    - Fetching cards for search.

- **ExperienceCardChildPatch / ChildValueItem / ExperienceCardChildResponse**
  - Represent the **child card dimension items**:
    - Each child has `child_type` and `items: ChildValueItem[]` where each item is `{ title, description? }`.

- **CardFamilyResponse**
  - Higher‑level DTO used in other endpoints: `parent: ExperienceCardResponse`, `children: ExperienceCardChildResponse[]`.

---

## 7. Pipeline Internals: From Prompt to Card Family

All orchestrated in `src/services/experience/pipeline.py`.

### 7.1 Constants and Token Budgets

- Named LLM token budgets:
  - `_LLM_TOKENS_REWRITE`, `_LLM_TOKENS_EXTRACT`, `_LLM_TOKENS_FILL_MISSING`, `_LLM_TOKENS_DETECT`,
    `_LLM_TOKENS_PROFILE_REFLECTION`, `_LLM_TOKENS_CLARIFY_PLAN`, `_LLM_TOKENS_CLARIFY_QUESTION`,
    `_LLM_TOKENS_CLARIFY_APPLY`
- Field caps: `_MAX_FIELD_SHORT`, `_MAX_FIELD_NORM`, `_MAX_FIELD_TITLE`, `_MAX_SUMMARY_LEN`,
  `_MAX_INTENT_SECONDARY`, `_MAX_AUTOFILL_ITERATIONS`.

These ensure **LLM calls remain bounded** and resulting fields respect DB constraints.

### 7.2 Rewrite Cache

- In‑process cache keyed by `sha256(raw_text)`.
- Prevents **re‑paying for identical rewrites** within the process.
- `rewrite_raw_text` first consults `_rewrite_cache_get`, then calls chat provider and
  stores via `_rewrite_cache_set`.

### 7.3 LLM Card Models (`Card`, `Family`, `ExtractorResponse`)

- **Card**
  - A rich structure encompassing:
    - `headline`, `title`, `summary`, `raw_text`
    - `time` / `location` containers
    - Derived flat fields:
      - `start_date`, `end_date`, `is_current`
      - `city`, `country`
      - `roles`, `entities`, `actions`, `outcomes`, `evidence`
      - `company`, `company_name`, `organization`, `team`,
        `normalized_role`, `seniority_level`, `domain`, `sub_domain`,
        `company_type`, `employment_type`,
        `intent`, `intent_primary`, `intent_secondary`, `confidence_score`
    - Metadata: `person_id`, `created_at`, `child_type`, `items`, etc.
- **Model validators**:
  - `normalize_prompt_style_fields`:
    - Adapts prompt‑style keys into compatible fields.
    - Converts parent date/location/intent into unified containers.
    - Normalizes list fields (`roles`, `entities`, `actions`, `outcomes`, `evidence`).
    - Extracts `value.items` → `items` for child cards.
  - `normalize_time`, `normalize_location`:
    - Accept either strings or dicts; convert strings into structured containers.

- **Family**
  - `parent: Card`
  - `children: Card[]`

- **ExtractorResponse**
  - `families: Family[]`
  - Wraps the raw JSON from the extractor LLM.

### 7.4 Parsing, Context Inheritance, Child Merge

Important helpers:

- `_get_parent_time`, `_get_parent_location`:
  - Extract canonical time / location from parent card dict.

- `_inherit_parent_context_into_children`:
  - For each child:
    - If child time is missing, **copies parent time** into child (and its `value`).
    - If child location is missing, **copies parent location**.

- `_merge_duplicate_children`:
  - If multiple children share the same `child_type`, merges them into one by:
    - Combining `value.items` via `merge_child_items` after `normalize_child_items`.

This ensures **child cards have reasonable inherited context** and **no duplicate dimensions**.

### 7.5 Persisting and Embedding

Downstream functions (not exhaustively listed here) perform:

- **Mapping card → DB fields**
  - `card_to_experience_card_fields`
  - `card_to_child_fields`
- **Persisting families**
  - `persist_families(db, ...)`:
    - Creates / updates `ExperienceCard` and `ExperienceCardChild` rows.
    - Links them to `RawExperience` / `DraftSet`.
- **Embedding**
  - `embed_experience_cards(db, parents, children)`:
    - Builds search documents (via `search_document` helpers).
    - Calls embedding provider to fetch vectors.
    - Flushes updates.

These are called both:

- In the **draft pipeline** (`run_draft_single`), and
- In **clarify/fill‑missing/finalize** flows via `_reembed_cards_after_update`.

---

## 8. Clarify Flow: Planner → Question → Apply

The clarify flow is split across:

- `pipeline.py` (orchestration)
- `clarify.py` (plan/missing fields/merge logic)
- Prompt templates in `prompts/experience_card.py`:
  - `PROMPT_CLARIFY_PLANNER`
  - `PROMPT_CLARIFY_QUESTION_WRITER`
  - `PROMPT_CLARIFY_APPLY_ANSWER`
  - `PROMPT_PROFILE_REFLECTION`

### 8.1 High‑Level Algorithm

Given:

- `raw_text`
- `current_card` (possibly partially filled)
- `card_family` / `card_families`
- `asked_history_structured`
- `last_question_target`

The pipeline:

1. **Normalizes** the family (`normalize_card_family_for_clarify`).
2. **Plans** which fields to ask about (`ClarifyPlan`) using `PROMPT_CLARIFY_PLANNER`.
3. **Checks** if parent is already good enough (`is_parent_good_enough`) or if `should_stop_clarify`.
4. **If questions needed**:
   - Chooses a **target field / child type**.
   - Uses `PROMPT_CLARIFY_QUESTION_WRITER` to craft a natural question.
   - Returns `clarifying_question` and updates `asked_history_entry`.
5. **When user answers**:
   - Uses `PROMPT_CLARIFY_APPLY_ANSWER` to extract a **patch** into the card / child.
   - `merge_patch_into_card_family` and `normalize_after_patch` update the canonical family.
   - Runs `_run_clarify_flow` again with updated history until either:
     - No more high‑value questions remain, or
     - Max questions reached, or
     - LLM signals `should_stop`.
6. **Profile reflection**
   - Independently, `PROMPT_PROFILE_REFLECTION` may produce:
     - `profile_reflection` summarizing what this experience says about the person.
     - Optional `profile_update` for axes like `skills`, `knowledge_areas`, etc.

The **frontend simply feeds answers and displays questions**; all decisions about **which fields to ask** and **when to stop** live entirely in this pipeline.

---

## 9. End‑to‑End Example (Typed Flow)

Putting it together for a typical Builder session:

1. **User opens Builder page**
   - Frontend asks `/experience-cards/clarify-experience` with empty state.
   - Backend returns an opener question.
   - Builder shows that as the first assistant message.

2. **User types a long narrative**
   - Stage: `awaiting_experience`.
   - Frontend calls `/experience-cards/detect-experiences`.
   - Backend uses `detect_experiences` prompt to identify N experiences.

3. **Single experience case**
   - Frontend calls `/experience-cards/draft-single`.
   - Pipeline: rewrite → extract families → normalize → persist → embed.
   - Frontend shows a **summary** and calls `askClarify`.

4. **Clarify loop**
   - Backend planner selects fields to clarify.
   - Writer produces first clarifying question.
   - User answers; frontend appends to `clarifyHistory` and calls `askClarify` again.
   - When pipeline decides the card is good enough:
     - It returns `filled` + `should_stop`.
     - Backend merges and may persist `filled`, then:
       - Frontend finalizes via `/experience-cards/finalize`.
       - Card becomes visible and embedded.

5. **Card preview & navigation**
   - Final assistant message includes `card: DraftCardFamily` payload.
   - UI renders `CardDetails` + child threads.
   - User can click **“View in Your Cards”** to inspect and edit the persisted schema.

---

## 10. End‑to‑End Example (Voice Flow, High‑Level)

1. **User taps the AiSphere**
   - `toggleVoice` creates a Vapi client pointing at the Convai proxy.
   - Voice call starts; convai uses its own prompts + callbacks.
2. **Vapi emits transcript `message` events**
   - Builder actively appends them to `messages` with role `user` or `assistant`.
   - This is more of a **conversational transcript surface**; card creation still relies on text flows.
3. **Concluding / syncing**
   - When `call-end` fires:
     - Frontend invalidates `EXPERIENCE_CARD_FAMILIES_QUERY_KEY`.
     - If the convai backend used the same pipeline to create experience cards, they appear in **Your Cards**.

In other words, **voice and text share the same underlying experience card schema and embedding**, but they rely on slightly different orchestration surfaces (BuilderChat vs Convai adapter).

---

## 11. Where to Change What

- **Prompt / schema level changes**
  - Update `src/prompts/experience_card.py` and `Card` / `Family` in `pipeline.py`.
  - Adjust `ExperienceCardBase` / children schemas in `src/schemas/builder.py` and DB models.

- **How many questions to ask / clarify behaviour**
  - Tune `DEFAULT_MAX_PARENT_CLARIFY`, `DEFAULT_MAX_CHILD_CLARIFY` and logic in `clarify.py`.
  - Adjust planner / question writer prompts.

- **Frontend UX (copy, stages, transitions)**
  - Update `BuilderChat` (messages, stage machine, how multiple experiences are presented).
  - Adjust `CardDetails` and child summary helpers.

- **Voice behaviour**
  - Change `toggleVoice` / `AiSphere` in `BuilderChat` and/or `VapiVoiceWidget`.
  - Modify convai router / adapter and Vapi assistant config.

With this, you should be able to trace **every single step** from raw user prompt (text or voice) → LLM prompts → internal `Card`/`Family` schema → persisted `ExperienceCard` / `ExperienceCardChild` → embeddings powering search and “Your Cards”.

