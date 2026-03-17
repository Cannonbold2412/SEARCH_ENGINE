### 1. Tech stack

- **Frontend**: `apps/web` — Next.js 16 (App Router, React 18, TypeScript, Tailwind CSS, Radix UI, Framer Motion, TanStack Query).
- **Backend**: `apps/api` — FastAPI with async SQLAlchemy, pgvector, SlowAPI rate limiting, httpx for outbound calls.
- **Database**: PostgreSQL + `pgvector` (embedding column on `experience_cards.embedding` and `experience_card_children.embedding`).
- **LLM / embeddings**: OpenAI-compatible providers configured via `apps/api/src/core/config.py` (`chat_api_base_url`, `chat_model`, `embed_api_base_url`, `embed_model`, `embed_dimension=324`).
- **Voice**: Vapi AI real-time voice (`@vapi-ai/web` in web, `/convai/*` routes in API) using custom-LLM mode that calls the clarify/search pipelines.

---

### 2. High-level folder structure

- **Root**
  - `package.json`: Next.js/Tailwind/TypeScript app config (monorepo-style, but only `apps/web` and `apps/api` are relevant).
  - `Builder.md`: product + UX spec for the experience builder (good context for “intent” of the flows).
- **Backend (`apps/api`)**
  - `src/main.py`: FastAPI app factory; mounts routers from `src/routers/__init__.py`, configures CORS and rate limiting.
  - `src/core/`: configuration, JWT, limiter, constants.
    - `config.py`: reads `.env`, defines `Settings` (DB, chat/embed/voice providers, rates).
    - `auth.py`: token generation/validation helpers.
    - `limiter.py`: SlowAPI limiter + key functions.
  - `src/db/`:
    - `models.py`: all SQLAlchemy ORM models, including people, profile, credit ledger, experience cards, search, chats.
    - `session.py`: engine/session factory, `Base`.
    - `seed_demo_profiles.py`: demo data (impacts search behavior when embeddings are missing).
  - `src/schemas/`: Pydantic schemas shared across routes.
    - `search.py`: `SearchRequest`, `SearchResponse`, parsed constraint structures (`ParsedConstraints*`).
    - `builder.py`: builder pipeline requests (raw text, clarify, finalize).
    - `profile.py`, `bio.py`, `auth.py`, `contact.py`, `credits.py`, etc.: user/profile/contact/credits payloads.
  - `src/domain.py`: domain enums for experience intent, child dimensions, employment type, etc. Single source of truth.
  - `src/prompts/`: LLM prompt templates.
    - `experience_card.py`: prompts for rewrite/detect/extract/clarify/fill-missing.
    - `experience_card_enums.py`: stringified enums for prompts.
    - `search_why_matched.py`: prompt to explain “why matched” bullets for search results.
    - `search_filters.py`: prompt to parse free-text query into structured constraints.
  - `src/services/experience/`: messy-text → structured ExperienceCard (+ children) pipeline.
    - `pipeline.py`: orchestrates rewrite, detect, extract, clarify, fill-missing, embed.
    - `child_value.py`: canonical JSON schema for child dimensions (`value = { raw_text, items[] }`).
    - `search_document.py`: derives search text for embedding from card fields.
    - `embedding.py`: builds and sends embedding batches.
    - `crud.py`: patch helpers for ExperienceCard and ExperienceCardChild.
    - `clarify.py`: clarify planner/validator/merge logic.
  - `src/services/search/`: search + ranking + explainability.
    - `search.py`: `SearchService` facade (used by `routers/search.py`).
    - `search_logic.py`: entire hybrid search pipeline (embedding, Postgres lexical search, constraint parsing, ranking, “why matched”, graph bonus, history).
    - `search_profile_view.py`: aggregation for discover/public profile/unlocked views.
    - `search_contact_unlock.py`: unlock-contact business logic.
    - `search_graph_view.py`: graph/RAG-style “PersonGraphFeatures” and `compute_graph_bonus`.
    - `filter_validator.py`: post-LLM constraint normalization.
    - `why_matched_helpers.py`: deterministic fallback + boosting of LLM explanations.
  - `src/services/convai/`: voice adapter.
    - `adapter.py`: bridges Vapi OpenAI-style messages to experience clarify pipeline and embedding.
    - `session.py`: in-memory session state keyed by `conversation_id`.
    - `__init__.py`: re-exports `convai_chat_turn`, session helpers.
  - `src/services/chat.py`/`src/providers/chat.py`: abstraction over chat provider (OpenAI-compatible).
  - `src/providers/embedding.py`: embedding provider abstraction.
  - `src/services/profile.py`, `src/services/credits.py`, `src/services/auth.py`: profile, wallet, auth helpers.
  - `src/routers/`: HTTP surface.
    - `auth.py`, `profile.py`, `contact.py`, `builder.py`, `search.py`, `convai.py`, `chat.py`.
    - `__init__.py`: `ROUTERS` tuple included in `main.py`.
  - `docs/EXPERIENCE_CARD_FLOW.md`: detailed doc for experience pipeline (already AI-oriented).
- **Frontend (`apps/web`)**
  - `src/app/`: Next.js routes.
    - Public: `page.tsx` (marketing), `login`, `signup`, `verify-email`, `terms`, `privacy`.
    - Authenticated: folder `(authenticated)` with `layout.tsx` and pages (`home`, `searches`, `builder`, `cards`, `people/[id]`, `inbox`, `explore`, `profile`, `settings`, `credits`, `unlocked`).
  - `src/components/`:
    - `search/`: `search-form.tsx`, `search-results.tsx`, `person-result-card.tsx`.
    - `builder/`: `chat/builder-chat.tsx`, `voice/vapi-voice-widget.tsx`, `card/*`, `family/*`, `forms/*`, `ai-sphere.tsx`.
    - `navigation/`: `app-nav.tsx`.
    - `feedback/`: loading/error components.
    - `ui/`: shadcn-style primitives (`button`, `input`, `dropdown-menu`, `tooltip`, etc.).
    - `landing/*`: marketing hero, search demo, etc.
  - `src/contexts/`: React Context providers.
    - `auth-context.tsx`: auth state, onboarding step.
    - `search-context.tsx`: client-side state for running searches and “load more” pagination.
    - `sidebar-width-context.tsx`: layout state.
  - `src/hooks/`: data-fetch + builder helpers (`use-experience-cards-v1`, `use-card-mutations`, `use-profile-v1`, etc.).
  - `src/lib/`:
    - `api.ts`: typed fetch client, adds `Authorization` + `Idempotency-Key`.
    - `auth-flow.ts`: auth/onboarding paths.
    - `constants.ts`: `API_BASE`, `apiAssetUrl` helpers.
    - `schemas.ts`: zod schemas for forms.
  - `src/types/`: shared TS types mirroring backend (`SearchResponse`, `DraftSetResponse`, `PersonSearchResult`, etc.).

---

### 3. Main backend modules

- **Experience pipeline (`services/experience`)**
  - Entry via `src/routers/builder.py`:
    - `POST /experience-cards/detect-experiences` → `detect_experiences(raw_text)` in `pipeline.py`.
    - `POST /experience-cards/draft-single` → `run_draft_single(db, person_id, raw_text, experience_index, experience_count)`.
    - `POST /experience-cards/clarify-experience` → `clarify_experience_interactive(...)` orchestrating planner/question/answer prompts.
    - `POST /experience-cards/finalize` → loads parent + children, calls `embed_experience_cards`, marks card visible.
  - `pipeline.py` is the central orchestrator:
    - Rewrite step, multi-experience detect, single-experience extract, parse → `Family`, persist family (`ExperienceCard` + `ExperienceCardChild`), clarify loop, fill-missing, re-embed.
    - All prompt-level details are in `EXPERIENCE_CARD_FLOW.md` and `prompts/experience_card.py`.

- **Search pipeline (`services/search`, `services/experience/search_document.py`)**
  - Public API: `SearchService` (`search.py`) used by `routers/search.py`.
  - Core logic: `search_logic.py`:
    - `run_search(...)`: high-level pipeline (see section 6 below).
    - `load_search_more(...)`: pagination over previously persisted `SearchResult` rows.
    - `list_searches()`, `delete_search()`: search history.
  - Graph augmentation: `graph_view.py`:
    - `extract_person_graph_features(parent_cards, children, must, should)` → `PersonGraphFeatures`.
    - `compute_graph_bonus(features, must, should)` gives a small score nudge (capped at 0.10).
  - Filter normalization: `filter_validator.py`.
  - Why-matched explainability: `why_matched_helpers.py` + `prompts/search_why_matched.py`.

- **Voice / Convai (`services/convai`, `routers/convai.py`)**
  - `convai.py`:
    - `/convai/call` and `/convai/call/web`: proxy to Vapi `https://api.vapi.ai/call*`, injects custom-LLM URL back to this API.
    - `/convai/v1` and `/convai/v1/chat/completions`: OpenAI-compatible chat completions endpoint used by Vapi.
  - `services/convai/adapter.py`:
    - `convai_chat_turn(...)`: handles Vapi message payloads, runs detect/draft/clarify pipeline similarly to `BuilderChat`, persists and embeds cards when “good enough”.
    - Uses in-memory `ConvaiSessionState` from `services/convai/session.py`.

- **Auth / profile / credits**
  - `routers/auth.py` + `services/auth.py` + `schemas/auth.py`: login/signup/verify OTP/email.
  - `routers/profile.py` + `services/profile.py` + `schemas/profile.py`/`bio.py`: PersonProfile CRUD, profile photo upload.
  - `routers/contact.py` + `services/search_contact_unlock.py` + `schemas/contact.py`: unlock-contact and contact exposure.
  - `services/credits.py` + `db.models.CreditLedger` + `PersonProfile.balance`: credit wallet, `deduct_credits` used by search + unlock.

---

### 4. Main frontend modules

- **Authenticated shell**
  - `app/(authenticated)/layout.tsx`:
    - Reads auth state from `useAuth`, enforces onboarding with `getPostAuthPath`/`isPathAllowedForStep`.
    - Wraps children in `SearchProvider` and `SidebarWidthProvider` and renders `AppNav`.
  - `components/navigation/app-nav.tsx`: main nav bar (links to `home`, `builder`, `searches`, `cards`, `inbox`, etc.).

- **Search UI**
  - `contexts/search-context.tsx`:
    - State: `query`, `searchId`, `people[]`, error, `hasMore`, `isSearching`, `isLoadingMore`.
    - `performSearch()` → POST `/search` using `apiWithIdempotency<SearchResponse>`.
    - `loadMore()` → GET `/search/{searchId}/more?offset={people.length}&limit=6`.
    - Invalidates React Query keys `["credits"]` and `["me","searches"]` to keep credits + history in sync with backend.
  - `components/search/search-form.tsx`: search bar bound to `useSearch`.
  - `components/search/search-results.tsx`:
    - Takes `searchId` + `people[]` (from context).
    - Locally sorts by `similarity_percent` descending but otherwise trusts backend ranking.
    - Shows “Unlock more profiles” button → `useSearch().loadMore()`.
  - `components/search/person-result-card.tsx`:
    - Renders individual `PersonSearchResult`:
      - Photo: uses backend `/people/{id}/photo` or external URL via `apiAssetUrl`.
      - “Why matched” bullets from `person.why_matched` (max 3) with fallback “Matched your search intent and profile signals.”.
      - Similarity badge based on `similarity_percent`.
    - Links to `/people/{id}?search_id={searchId}` for profile details.
  - `app/(authenticated)/searches/page.tsx`:
    - Uses React Query to GET `/me/searches?limit=200` and `/search/{searchId}/more?history=true`.
    - Displays saved searches and “history results” using the same `PersonResultCard` UI.

- **Experience builder (text + voice)**
  - `components/builder/chat/builder-chat.tsx`:
    - Chat-style UI for building `ExperienceCard` families from free-form text.
    - Flow:
      1. On mount, calls `POST /experience-cards/clarify-experience` with empty text to get an opening question.
      2. On first user message, calls `POST /experience-cards/detect-experiences`.
      3. If one experience: `POST /experience-cards/draft-single` → shows summary + card preview; then `POST /experience-cards/clarify-experience` loop using clarify planner/answer pipeline.
      4. If multiple: asks user to choose; then same draft + clarify as above.
      5. When clarify returns `should_stop` or filled enough fields:
         - Calls `POST /experience-cards/finalize` with `card_id` and invalidates `EXPERIENCE_CARDS_QUERY_KEY` + `EXPERIENCE_CARD_FAMILIES_QUERY_KEY`.
    - Also exports `ClarifyHistoryEntry` and `ClarifyResponse` types mirroring backend clarify output.
    - Integrates voice via `AiSphere` + Vapi (see Voice flow section).
  - `components/builder/voice/vapi-voice-widget.tsx`:
    - Alternative voice-only builder for a “Voice” tab; uses the same Convai backend routes.

- **Profiles, cards, and search integration**
  - `app/(authenticated)/home/page.tsx`: primary entry for running searches and viewing first results (uses `SearchProvider`).
  - `app/(authenticated)/people/[id]/page.tsx`:
    - Uses `search_id` from query string to fetch person profile with “why matched” details (`GET /people/{id}?search_id=...`).
  - `app/(authenticated)/cards/page.tsx`: shows user’s own `ExperienceCard` families (built by builder or Convai flows).
  - `hooks/use-experience-cards-v1.ts` + `hooks/use-card-mutations.ts`: wrap `GET /me/experience-cards` (+ finalize/edit) endpoints.

---

### 5. Database schema overview (key entities)

Defined in `apps/api/src/db/models.py`.

- **Person / PersonProfile**
  - `Person`: `id`, `email`, `hashed_password`, `display_name`, email verification fields.
  - `PersonProfile`: bio + visibility + wallet:
    - `open_to_work: bool`, `work_preferred_locations: ARRAY(String)`, `work_preferred_salary_min: Numeric`.
    - `open_to_contact: bool`, `email_visible`, `phone`, `linkedin_url`, `other`.
    - `balance: int` (credits, default 1000).

- **Experience pipeline**
  - `RawExperience`: raw free-form text and cleaned text.
  - `DraftSet`: grouping of cards for one pipeline run, with `extra_metadata`.
  - `ExperienceCard` (parent card):
    - IDs: `id`, `person_id`, `draft_set_id`, `user_id` synonym.
    - Structure:
      - Domain filters: `domain`, `domain_norm`, `sub_domain`, `sub_domain_norm`.
      - Company filters: `company_name`, `company_norm`, `company_type`, `team`, `team_norm`.
      - Time: `start_date`, `end_date`, `is_current`.
      - Location: `location` free text, `city`, `country`, `is_remote`.
      - Intent: `intent_primary`, `intent_secondary` (ARRAY), `seniority_level`, `employment_type`.
      - Content: `summary`, `raw_text`, `confidence_score`.
      - Search: `experience_card_visibility` (bool), `embedding: Vector(324)`.
  - `ExperienceCardChild`:
    - IDs: `id`, `parent_experience_id`, `person_id`, `raw_experience_id`, `draft_set_id`.
    - Content: `child_type` (one of ALLOWED_CHILD_TYPES), `value: JSONB` (`{ raw_text, items[] }`).
    - Search: `embedding: Vector(324)`, `extra: JSONB`.

- **Search**
  - `Search`:
    - `searcher_id`, `query_text`, `parsed_constraints_json`, `filters`, `extra` (contains `fallback_tier`), timestamps, `expires_at`.
  - `SearchResult`:
    - `search_id`, `person_id`, `rank`, `score: Numeric(10,6)`.
    - `extra: JSONB`:
      - `"matched_parent_ids": [ExperienceCard.id]`.
      - `"matched_child_ids": [ExperienceCardChild.id]`.
      - `"why_matched": [str]`.
      - `"graph_features": { domains_matched, child_types_matched, ... }` (from `graph_view.build_graph_features_dict`).

- **Credits and idempotency**
  - `CreditLedger`: append-only ledger per person; used for balance calculations.
  - `IdempotencyKey`: stores `response_body` for `search` and `unlock-contact` endpoints keyed by `Idempotency-Key` header.

- **Contact unlocking**
  - `UnlockContact`: links `searcher_id`, `target_person_id`, `search_id` for credit-paid contact unlocks.

- **Chats**
  - `Conversation`, `Message`: 1:1 chat metadata and content (used by `/chat` and inbox pages).

Overall, search operates over `ExperienceCard` and `ExperienceCardChild` embeddings + text, but results are keyed by `Person` and enriched from `PersonProfile`.

---

### 6. Search pipeline (backend)

Implemented in `apps/api/src/services/search/search_logic.py` and wired via `SearchService` and `routers/search.py`.

- **Entry**
  - `POST /search` (`routers/search.py`):
    - Body: `SearchRequest { query: str, num_cards?: int, ... }`.
    - Headers: optional `Idempotency-Key`.
    - Auth: Bearer token → `get_current_user`.
    - Rate limited by `Settings.search_rate_limit` via SlowAPI.

- **Steps inside `run_search`**
  1. **Idempotency**:
     - If `Idempotency-Key` present, check `IdempotencyKey` table via `get_idempotent_response`; if found, short-circuit.
  2. **Parse query with LLM**:
     - `chat = get_chat_provider()`.
     - `_parse_search_payload(chat, raw_query)` calls `chat.parse_search_filters` (OpenAI-style) with prompt from `prompts/search_filters.py`.
     - Result normalized via `filter_validator.validate_and_normalize(...)` into `ParsedConstraintsPayload` including:
       - `must` (company, domain, time window, location, intent, open_to_work, salary range).
       - `should` (skills/tools, keywords, secondary intents).
       - `exclude`.
       - `search_phrases`, `query_embedding_text`, `query_cleaned`, `num_cards?`.
  3. **Resolve `num_cards` and credits**:
     - Priority: `body.num_cards` override → `payload.num_cards` from LLM → `_extract_num_cards_from_query(query)` regex over raw text → default `DEFAULT_NUM_CARDS=6`.
     - Clamp to `[1, TOP_PEOPLE_STORED=24]`.
     - Check `get_balance(db, searcher_id)` ≥ `num_cards`, else 402.
  4. **Build embedding and lexical inputs**:
     - `_build_embedding_text(payload, body)` chooses best text for embedding.
     - `_build_query_ts(payload, body)` builds tsquery string from `search_phrases` and top `should.keywords`.
  5. **Parallel embedding + lexical pre-candidate search**:
     - `embed_task = _embed_query_vector(body.query, embedding_text)`:
       - Uses `get_embedding_provider().embed([text])` and `normalize_embedding` to 324-dim vector.
     - `lexical_task = _lexical_candidates(db, query_ts)`:
       - Runs raw SQL (using `sqlalchemy.text`) against Postgres:
         - Parents: `to_tsvector('english', parent_doc_expr) @@ plainto_tsquery('english', :q)`.
         - Children: similar over child JSONB.
       - Returns `person_id → lexical_bonus ∈ [0, LEXICAL_BONUS_MAX]`.
     - If embedding fails → 503; if vector empty → create empty `Search` record with `num_cards=...` but no results (no credits deducted).
  6. **Constraint term extraction**:
     - `_collect_constraint_terms(must, exclude_company_norm, exclude_keywords)` → `_SearchConstraintTerms`:
       - Normalized company/team lists.
       - Derived `time_start`, `time_end`, `query_has_time`, `query_has_location`.
  7. **Candidate generation with fallback tiers**:
     - `_fetch_candidates_with_fallback`:
       - For each `fallback_tier` from STRICT (0) to COMP_Team_SOFT (3):
         - Build `_FilterContext` with different strengths of time/location/company/team filters.
         - Run `_fetch_candidate_rows_for_filter_ctx`:
           - Parents: `ExperienceCard` with `embedding.cosine_distance(query_vec)` (pgvector) + `_apply_card_filters`.
           - Child aggregate distances per person and per-child evidence rows.
         - Continue relaxing until `len(unique_person_ids) ≥ MIN_RESULTS=15` or last tier.
  8. **Lexical-only fallback**:
     - If vector search returns no candidates (e.g. no embeddings exist yet):
       - Use lexical scores (strict tsquery) or relaxed `_lexical_candidates_relaxed` (OR tsquery) over the same doc expressions.
       - `_fetch_candidates_lexical_only` turns lexical `person_id → score` into pseudo-distance rows so the same ranking pipeline can run.
  9. **Preload child evidence**:
     - `_load_child_evidence_map(db, child_evidence_rows)` fetches `ExperienceCardChild` rows for evidence child IDs.
  10. **Collapse per-person and compute scores**:
      - `_collapse_and_rank_persons(...)` orchestrates:
        - `_build_parent_card_scores` → per-person card list with card-level sims and `should` hits.
        - `_build_child_similarity_maps` → per-person best child sims and evidence.
        - `extract_person_graph_features(parent_cards, children, must, should)` to compute `PersonGraphFeatures` per person.
        - `_score_person(...)` combining:
          - Base: weighted combination of `parent_best`, `child_best`, `avg_top3`.
          - `lexical_bonus`, `should_bonus` (capped).
          - `graph_bonus` from `graph_view.compute_graph_bonus`.
          - Penalties for missing dates or location mismatch when query asked for them but filters were softened.
      - Outputs:
        - `person_cards`.
        - `child_sims_by_person`.
        - `child_best_parent_ids`.
        - Sorted `person_best: [(person_id, score)]`.
        - `graph_features_map`.
  11. **Load people + profiles + children**:
      - `_load_people_profiles_and_children(db, person_ids, child_evidence_rows, preloaded_children)`:
        - Loads `Person`, `PersonProfile`, reuses `children_by_id`.
  12. **Apply tiebreakers**:
      - `_apply_post_rank_tiebreakers`:
        - If recruiter budget set (salary filter): sort ties by presence of `work_preferred_salary_min`.
        - If time window set: prefer cards with exact overlap in the requested period.
  13. **Create `Search` row and deduct credits**:
      - `_create_search_record`: persists `Search` with `filters_dict` and `fallback_tier`.
      - `_deduct_search_credits_or_raise`: debits `num_cards` credits from wallet; 402 on failure.
  14. **Prepare pending `SearchResult` rows and LLM evidence**:
      - `_prepare_pending_search_rows`:
        - For each ranked person:
          - Computes `similarity_percent` (0–100) from score.
          - Picks matched parent IDs and child IDs.
          - Builds per-person evidence payload for why-matched (top parents + children).
        - Also precomputes deterministic fallback `why_matched` bullets for each person from evidence (no LLM yet).
  15. **Synchronous LLM “why matched” (if configured)**:
      - `_generate_llm_why_matched(chat, payload, people_evidence)`:
        - Builds a single prompt with query context + `people_evidence`.
        - Expects JSON mapping `person_id → ["reason 1", "reason 2", ...]`.
        - On error, falls back to deterministic bullet builder.
  16. **Persist `SearchResult` rows**:
      - `_persist_search_results(db, search_id, pending_rows[:num_cards], llm_why_by_person, graph_features_map)`:
        - Writes `SearchResult` rows with final `why_matched` lines and `graph_features` into `extra`.
  17. **Optional async LLM refresh**:
      - `_update_why_matched_async`: after commit, background task can recompute why-matched via LLM for persisted results; uses `async_session`.
  18. **Build response**:
      - `_build_search_people_list(...)`:
        - Creates `PersonSearchResult` with:
          - `id`, `name`, `headline`, `bio`, `profile_photo_url`.
          - `similarity_percent`.
          - `why_matched`: final LLM/deterministic bullets.
          - `open_to_work`, `open_to_contact`, `work_preferred*`.
          - `matched_cards`: top 3 `ExperienceCard` responses.
      - Response: `SearchResponse { search_id, people: PersonSearchResult[], num_cards }`, saved to `IdempotencyKey` if header was present.

`GET /search/{search_id}/more` simply pages through existing `SearchResult` rows, rebuilding `PersonSearchResult` using stored `extra["matched_parent_ids"]` and `extra["why_matched"]`.

---

### 7. Ranking logic (scoring, graph bonus, penalties)

All implemented in `search_logic.py`:

- **Card-level similarity**
  - Parent and child embeddings use pgvector cosine distance via `ExperienceCard.embedding.cosine_distance(query_vec)` and `ExperienceCardChild.embedding.cosine_distance(query_vec)`, converted to similarity in \((0,1]\) using `_similarity_from_distance`.
  - Card-level `should` hits (skills/tools/keywords) add small boosts before aggregation.

- **Per-person score composition (`_score_person`)**
  - Inputs:
    - `parent_cards: [(ExperienceCard, sim)]`.
    - `child_cards: [(parent_id, child_id, sim)]`.
    - `child_best_sim`, `lexical_scores`, `person_should_hits`, `fallback_tier`, `query_has_time/location`, `query_loc_terms`, `graph_features`.
  - Steps:
    - Collect up to `TOP_K_CARDS=5` sims from parents + children.
    - Compute:
      - `parent_best`, `child_best`, `avg_top3`.
      - `base_score = 0.55 * parent_best + 0.30 * child_best + 0.15 * avg_top3`.
      - `lexical_bonus` in `[0, 0.25]` from strict/relaxed lexical search.
      - `should_bonus` in `[0, 0.25]` from `should` hits (skills/tools/keywords).
      - `graph_bonus` in `[0, 0.10]` via `compute_graph_bonus`.
      - Penalties:
        - Missing dates when query had explicit time and we had to relax time filter (fallback tier ≥ time-soft) → `MISSING_DATE_PENALTY=0.15`.
        - Location mismatch when query had location and fallback tier ≥ location-soft → `LOCATION_MISMATCH_PENALTY=0.15`.
    - Final `score = clamp(base + lexical_bonus + should_bonus + graph_bonus - penalty, 0..1)`.

- **Graph bonus (`graph_view.py`)**
  - `PersonGraphFeatures` built from:
    - Parent structural nodes (domain/company/location).
    - Child dimensions (skills, tools, metrics, collaborations, achievements, domain_knowledge, etc.).
    - Marketing/cross-functional regex patterns over child `raw_text` and parent `summary`.
    - Startup/scaleup company types and metric presence.
    - Hits of skills/tools vs `should.skills_or_tools`.
  - `compute_graph_bonus`:
    - Bonus 1: child-type coverage (metrics/collaborations/skills-tools/achievements/domain_knowledge) up to `GRAPH_BONUS_DIM_CAP=0.04`.
    - Bonus 2: domain + company simultaneously aligned with MUST constraints → `+0.05`.
    - Bonus 3: cross-functional + marketing traits when query signals marketing intent → `+0.04`.
    - Bonus 4: startup/scaleup company + nonempty metrics when query signals startup/metrics → `+0.03`.
    - Total capped at `GRAPH_BONUS_TOTAL_CAP=0.10` to ensure graph doesn’t dominate embedding similarity.

---

### 8. LLM usage points

Backend uses LLMs at several points (all via provider abstractions in `src/providers`):

- **Experience builder (text and voice)**
  - `services/experience/pipeline.py`:
    - `rewrite_raw_text`: `PROMPT_REWRITE` (rewrite).
    - `detect_experiences`: `PROMPT_DETECT_EXPERIENCES` (JSON list of candidate experiences).
    - `run_draft_single`: `PROMPT_EXTRACT_SINGLE_CARDS` (parent + children per experience).
    - `fill_missing_fields_from_text`: `PROMPT_FILL_MISSING_FIELDS`.
    - Clarify loop:
      - `PROMPT_CLARIFY_PLANNER`: decides next field to ask/autofill/stop.
      - `PROMPT_CLARIFY_QUESTION_WRITER`: generates one user-facing question.
      - `PROMPT_CLARIFY_APPLY_ANSWER`: converts user answer into JSON patch.
  - `docs/EXPERIENCE_CARD_FLOW.md` fully documents these prompts and expected JSON shapes.

- **Search parsing + explanations**
  - `services/search/search_logic.py`:
    - `_parse_search_payload(chat, raw_query)`:
      - Uses `chat.parse_search_filters` to go from free-text query → `ParsedConstraintsPayload`.
    - `_generate_llm_why_matched(chat, payload, people_evidence)`:
      - Uses `get_why_matched_prompt` to ask LLM “why matched” reasons for multiple people at once.
      - Expects JSON `person_id → [reasons]`, validated + sanitized; falls back deterministically on failure.

- **Voice (Convai custom LLM)**
  - `services/convai/adapter.py`:
    - `convai_chat_turn` uses the **same** builder clarify pipeline (`detect_experiences`, `run_draft_single`, `clarify_experience_interactive`) behind a Vapi-compatible OpenAI chat interface.
    - No additional prompts beyond those already documented for the builder pipeline.

LLM config and credentials are pulled from `Settings` (`chat_api_base_url`, `chat_api_key`, `chat_model`, `openai_api_key`) and used via `get_chat_provider()` / `get_embedding_provider()`.

---

### 9. Voice flow implementation

- **Frontend voice (builder context)**
  - `components/builder/chat/builder-chat.tsx`:
    - Uses an `AiSphere` “orb” to toggle Vapi voice calls.
    - `toggleVoice()`:
      - Reads JWT from `localStorage[AUTH_TOKEN_KEY]`.
      - Creates new `Vapi(token, proxyBase)` where `proxyBase = API_BASE + "/convai"`.
    - Vapi events:
      - `"call-start"` → set `voiceConnected`.
      - `"call-end"` → reset state and invalidate `EXPERIENCE_CARD_FAMILIES_QUERY_KEY`.
      - `"speech-start"`/`"speech-end"` → toggle who is “speaking” for animation.
      - `"message"` → transcripts appended to `messages` (role `user` or `assistant` based on event).
      - `"error"` → user-friendly hints for local testing:
        - On `start-method-error` with localhost API, suggests running ngrok and configuring `VAPI_CALLBACK_BASE_URL`.
  - `components/builder/voice/vapi-voice-widget.tsx`:
    - Similar to builder chat’s voice but dedicated to a “Voice” tab.
    - Shows transcript (user vs assistant) and uses Vapi’s `"message"` transcript events.
    - On `"call-end"`, invalidates `EXPERIENCE_CARD_FAMILIES_QUERY_KEY` so new cards appear.

- **Backend voice**
  - `routers/convai.py`:
    - `/convai/call` and `/convai/call/web`:
      - Check `Authorization: Bearer <token>`; decode JWT to `Person` using `decode_access_token` + DB lookup.
      - Validate `Settings.vapi_api_key` and `Settings.vapi_callback_base_url`.
      - Guard against local-API/remote-callback mismatch (requires ngrok/https tunnel).
      - Build transient Vapi assistant config with:
        - `"model": { "provider": "custom-llm", "url": "<API_BASE>/convai/v1?user_id=<uuid>", "model": "gpt-4o" }`.
        - Voice and transcriber providers from settings.
      - POST to `https://api.vapi.ai/call` or `/call/web`.
      - Call `create_session(user.id, user.id)` to track session in local memory.
    - `/convai/v1` and `/convai/v1/chat/completions`:
      - Extract `conversation_id` from `user_id` query param (cleanup if Vapi appended `/chat/completions`).
      - Resolve `ConvaiSessionState` via `get_session(conversation_id)` (enforces earlier `/call`).
      - Load DB session using `async_session`.
      - Call `convai_chat_turn(conversation_id, user_id, messages, db, state)`.
      - Stream reply as OpenAI-style SSE (`text/event-stream`) when `stream=true`.
  - `services/convai/adapter.py::convai_chat_turn`:
    - Maintains a simple state machine:
      - `awaiting_experience` → rewrite/detect → `run_draft_single` → `clarify_experience_interactive`.
      - `awaiting_choice` → parse ordinal from speech (1/first/etc) → `run_draft_single`.
      - `clarifying` → call `clarify_experience_interactive` repeatedly, updating `state.asked_history` and `state.card_family`.
      - `card_ready` → respond with guidance but keep session available for new experiences.
    - On `should_stop`, finalizes card:
      - Uses `experience_card_service.get_card`, applies patches (via `ExperienceCardPatch`), and calls `embed_experience_cards`.
      - Also loads children via `select(ExperienceCardChild)` and embeds them.

Voice is therefore a thin layer over the same experience-card pipeline, with the main risk being the in-memory `ConvaiSessionState` and callback URL mismatches in multi-instance deployments.

---

### 10. APIs/routes (surface area)

Key routes (non-exhaustive but covering search, builder, convai, and related flows):

- **Search (`routers/search.py`)**
  - `GET /people`: discover grid (profiles + top experience titles).
  - `POST /search`: main people search, returns `SearchResponse`.
  - `GET /search/{search_id}/more?offset&limit&history`: pagination.
  - `GET /me/searches?limit`: search history for current user.
  - `DELETE /me/searches/{search_id}`: delete saved search.
  - `GET /me/unlocked-cards`: list `UnlockContact` results.
  - `GET /people/{person_id}`: `PersonProfileResponse`, optionally using `search_id` for context.
  - `GET /people/{person_id}/photo`: profile image binary.
  - `GET /people/{person_id}/profile`: public profile with card families.
  - `POST /people/{person_id}/unlock-contact`: unlock contact details using credits.

- **Experience builder (`routers/builder.py`)**
  - `POST /experience-cards/detect-experiences`: detect multiple experiences in one text block.
  - `POST /experience-cards/draft-single`: extract one experience into a card family.
  - `POST /experience-cards/clarify-experience`: clarify pipeline (planner/questions/answers).
  - `POST /experience-cards/finalize`: embed + make card visible.
  - `POST /experience-cards/fill-missing-from-text`: fill missing fields based on new text.
  - `PATCH /experience-cards/{card_id}`, `PATCH /experience-card-children/{child_id}`: edit cards and re-embed.

- **Voice / Convai (`routers/convai.py`)**
  - `POST /convai/call` and `/convai/call/web`: proxy Vapi call creation, attach user-specific custom-LLM URL.
  - `POST /convai/v1` and `/convai/v1/chat/completions`: OpenAI chat-completions compatible endpoint for Vapi’s custom LLM.

- **Auth / profile / contact / chat**
  - `routers/auth.py`: signup/login/OTP/email-verify endpoints.
  - `routers/profile.py`: `GET/PUT /me/profile`, photo upload, profile preferences.
  - `routers/contact.py`: get unlocked contacts, request contact, etc.
  - `routers/chat.py`: chat conversations and messages for Inbox UI.

The frontend `api.ts` and `search-context.tsx` demonstrate practical usage patterns for these routes and the expectations around auth and idempotency headers.

---

### 11. Important models/entities (domain)

- **Experience entities (`domain.py`)**
  - `Intent`, `ChildRelationType`, `ChildIntent`, `SeniorityLevel`, `EmploymentType`, `CompanyType`, `ExperienceRelationType`, `ALLOWED_CHILD_TYPES`, `ENTITY_TAXONOMY`.
  - These control how LLMs are allowed to populate card fields and child dimensions and strongly influence search filtering behavior (e.g., `must.intent_primary`, `must.employment_type`).

- **Search constraints (`schemas/search.py`)**
  - `ParsedConstraintsPayload`:
    - `must`: includes domain/company/team, location, time, employment type, seniority, open_to_work, salary.
    - `should`: includes `skills_or_tools`, `keywords`, `intent_secondary`, `intent_secondary`-like.
    - `exclude`: company norms, keywords.
  - `SearchRequest`:
    - `query`, `num_cards?`, explicit filters (e.g., `open_to_work_only`, `salary_max`, `preferred_locations`).

- **Person-level features (`graph_view.PersonGraphFeatures`)**
  - Derived from the matched cards:
    - Boolean flags for metrics/collaborations/skills/tools/achievements/domain_knowledge.
    - Domain/company alignment and marketing/cross-functional signals.
    - Startup/company-type signals and metrics completeness.

These entities define the “semantic” knobs that LLMs and ranking use to interpret queries and cards.

---

### 12. Known issues / tricky areas

- **In-memory Convai sessions**
  - `services/convai/session.py` stores `ConvaiSessionState` in-process; multi-instance or restart will lose state, leading to “Session not found. Please start a new voice session.” errors.
  - This is acceptable for local testing but risky for production scale or horizontally scaled deployments.

- **Callback URL vs local API**
  - `/convai/call` enforces that when the request hits `localhost` but `VAPI_CALLBACK_BASE_URL` points to a remote host that is not a known tunnel domain (ngrok, etc.), it rejects the call with 503 and a fairly detailed message.
  - This is good for safety but is a common source of misconfiguration when moving between local and staging environments.

- **Embedding dimension coupling**
  - `models._EMBEDDING_DIM = 324` and `Settings.embed_dimension = 324` must match, or embeddings will break.
  - Changing embed model (e.g. `text-embedding-3-large` dimension) requires DB migration + code change in at least two places.

- **Search lexical SQL**
  - `_lexical_candidates` and `_lexical_candidates_relaxed` embed raw SQL strings with `text(...)` and manual concatenation of fields.
  - Any schema change to `experience_cards` or `experience_card_children.value` shape risks silently breaking lexical search.
  - Regex OR-building for relaxed search is hand-rolled and assumes only `[a-zA-Z0-9]` tokens.

- **Why-matched LLM JSON parsing**
  - `_generate_llm_why_matched` expects a JSON object; misformatted responses require JSON extraction via `extract_json_from_llm_response`.
  - Although fallback logic exists, misbehavior may still lead to empty or generic reasons; subtle cracks can appear between deterministic fallback and LLM output.

- **Frontend/Backend type drift**
  - TypeScript types in `apps/web/src/types` manually mirror Pydantic schemas; schema changes in Python can easily desync TS types.
  - Risk is especially high for `SearchResponse`, `DraftSetResponse`, `ClarifyExperienceResponse`, and `PersonSearchResult`.

- **Search history vs “more results”**
  - `SearchService.run_search` only persists the top `num_cards` results in `SearchResult`, but UI uses `TOP_PEOPLE_STORED` and `LOAD_MORE_LIMIT` assumptions.
  - If additional `person_best` exist beyond first `num_cards`, they are not stored; `hasMore` logic in `search-context.tsx` uses client-side `people.length >= LOAD_MORE_LIMIT` which may not reflect true backend capacity.

---

### 13. Technical debt / improvement opportunities

- **Session + state storage**
  - Move `ConvaiSessionState` and potentially clarify history from in-memory to a DB or cache (Redis) to support multi-instance scaling and resilience.
  - Similarly, consider centralizing idempotency keys and credit ledger operations in a transactional boundary to avoid subtle race conditions.

- **Search/embedding configuration**
  - Extract embedding dimension + model name into a single shared config module imported by both `models.py` and `config.py` to avoid drift.
  - Add explicit health checks for embedding and chat providers (e.g. `GET /health/llm`) used by the frontend.

- **Lexical SQL maintainability**
  - Refactor `_lexical_candidates` and `_lexical_candidates_relaxed` into a shared module with small helpers for doc-building and tsquery construction.
  - Add comments/tests that assert behavior when schema fields change (especially `ExperienceCardChild.value`).

- **Search history vs ranking**
  - Consider persisting all `TOP_PEOPLE_STORED` `SearchResult` rows (not just `num_cards`) and only deduct credits for the first `num_cards` shown, so history “more” pages can truly show the full ranked list.
  - Make `hasMore` in `search-context.tsx` consult `SavedSearchItem.result_count` rather than comparing to `LOAD_MORE_LIMIT`.

- **Front-back contract documentation**
  - Add more small docs similar to `EXPERIENCE_CARD_FLOW.md` for:
    - `SEARCH_FLOW.md` (search filters, ranking, why-matched, credits).
    - `CONVAI_FLOW.md` (voice storyboarding).
  - Keep TS and Pydantic schemas in sync via codegen or explicit tests.

- **LLM robustness**
  - For `search_filters` and `why_matched`, add stricter validators and logging for invalid outputs with structured metrics, not just log lines.
  - Introduce cheap, deterministic fallback ranking path for when embedding and/or chat providers are down (beyond current lexical fallback).

---

### 14. Suggestions needed (what another AI can help with)

- **Ranking experiments**
  - Propose and test alternative scoring blends using offline evaluation:
    - Adjust weights for parent vs child vs lexical vs graph bonuses.
    - Explore learning-to-rank or at least grid search over coefficients given logged search interactions (when available).
  - Suggest principled strategies for handling low-data/degenerate cases (few embeddings, cold-start users).

- **Query understanding and filter parsing**
  - Improve `parse_search_filters` prompts:
    - More robust extraction of time ranges, salary signals, and boolean intent (e.g., “open to remote only”).
    - Better mapping between free-text “company types” and `CompanyType` enums.
  - Detect “explain-only” queries (like “what does this mean?”) and short-circuit search accordingly.

- **Explainability (`why_matched`)**
  - Redesign `get_why_matched_prompt` to yield shorter, user-facing, and less repetitive bullets while minimizing token usage.
  - Propose a caching layer keyed by `(query, person_id, top_cards)` so repeated views require no new LLM calls.

- **Voice UX and robustness**
  - Improve `_parse_choice_input` to handle more natural utterances (“the Google role”, “second one about fintech”) more reliably.
  - Suggest strategies to reconcile partial voice transcripts with clarify history (e.g., repeated clarifications, backtracking).

- **Schema evolution + performance**
  - Analyze indexes (`domain_norm`, `company_norm`, `team_norm`, `city`, `country`) vs query patterns in `search_logic.py` to propose missing or redundant indexes.
  - Propose normalized vs denormalized representations where it would materially speed up queries (e.g., precomputed person-level summary docs).

- **Testing gaps**
  - Recommend unit/integration test coverage areas, especially around:
    - Fallback tiers.
    - Lexical-only fallback and relaxed query builder.
    - Graph bonus behavior vs test queries.
    - Convai flow across stage transitions and session loss scenarios.

