# Codebase Cleanup & Refactoring Plan
## What's Wrong (Audit Summary)
**Backend (`apps/api`):**
* `search_logic.py` is 1,891 lines — does scoring, candidate fetching, why_matched, persistence, and response building all in one file
* `pipeline.py` is 1,736 lines — mixes LLM models, rewrite cache, field extractors, persistence, serialization, and clarify orchestration
* `clarify.py` (643 lines) + clarify code inside `pipeline.py` — split confusingly across two files
* `services/search/search.py` — a pointless thin facade class that wraps functions, adding an indirection layer with no benefit
* `seed_demo_profiles.py` lives inside `src/db/` (a production source package) — should be a script
* `__pycache__` reveals deleted-but-once-existing files: `experience_card.py`, `experience_card_pipeline.py`, `convai.py` (old router), `me.py` (old schema/service), `child_value_v2.py`, `clarify_flow.py`, `search_filters_validator.py` — may have stale imports or dead references in current code
* `experience_card_enums.py` is a 36-line file that only re-formats enum strings for prompts — no reason to be its own module
**Frontend (`apps/web`):**
* `components/app-nav.tsx` (369 lines) and `components/navigation/app-nav.tsx` (229 lines) — two versions of the same component; the root one embeds search history logic directly and is the older version
* `components/landing/particle-field.tsx` and `components/landing/ParticleField.tsx` — duplicate file, different casing
* `builder-chat.tsx` is 757 lines — a monolith component that should be broken into sub-components
* `card-details.tsx` (599 lines), `saved-card-family.tsx` (489 lines) — same issue
* `cards/page.tsx` (416 lines), `settings/page.tsx` (345 lines), `searches/page.tsx` (339 lines) — page files with too much logic; should delegate to dedicated components
* `types/index.ts` (264 lines) contains API types that partially duplicate what's already in `lib/schemas.ts`
**Repo root:**
* `Builder.md`, `BUILDER_FLOW_DETAILED.md`, `SEARCH_ENGINE_CODE_DETAILS.md`, `SEARCH_ENGINE_OVERVIEW.md` — four large markdown files dumped at the root; should live in `docs/`
* `scripts/` only contains `ngrok-tunnel.ps1`; seed script should be moved here
* No test infrastructure exists anywhere
## Phase 1 — Repo-Level Housekeeping
Goal: clean the root and move misplaced files. No logic changes.
**1.1 Consolidate docs**
Create `docs/` at repo root. Move all four root-level `.md` files (`Builder.md`, `BUILDER_FLOW_DETAILED.md`, `SEARCH_ENGINE_CODE_DETAILS.md`, `SEARCH_ENGINE_OVERVIEW.md`) into `docs/`. The existing `apps/api/docs/` can stay as API-specific docs.
**1.2 Move seed script out of src**
Move `apps/api/src/db/seed_demo_profiles.py` → `scripts/seed_demo_profiles.py`. Update any import references. This is not production code and should not live inside a Python package.
**1.3 Delete stale frontend duplicate**
Delete `apps/web/src/components/app-nav.tsx` (the 369-line old version). The canonical navigation component is `apps/web/src/components/navigation/app-nav.tsx`. Update any imports pointing to the old path.
Delete `apps/web/src/components/landing/ParticleField.tsx` (the PascalCase duplicate). Keep `particle-field.tsx` (kebab-case, standard convention).
## Phase 2 — Backend: Kill the Facade & Dead Code
Goal: remove pointless abstraction layers and dead references. No logic changes.
**2.1 Delete `services/search/search.py` facade**
The `SearchService` class in this file is a thin wrapper with no added value — it literally just calls functions from `search_logic.py` and `search_profile_view.py`. Delete it. Update `routers/search.py` to import the underlying functions directly (they are already public functions).
**2.2 Merge `prompts/experience_card_enums.py` into `prompts/__init__.py`**
`experience_card_enums.py` is 36 lines that just build string constants from domain enums. Move these constants into `prompts/__init__.py` (or directly into `experience_card.py` where they are used). Delete the separate file.
**2.3 Audit and remove dead imports**
The `__pycache__` files reveal old modules: `convai.py`, `me.py`, `child_value_v2.py`, `clarify_flow.py`, `search_filters_validator.py`. Grep the codebase for any remaining imports of these old names and remove/update them. Also audit `schemas/discover.py` — check if `PersonListItem`, `PersonListResponse` are still used or superseded.
## Phase 3 — Backend: Split the Monster Files
Goal: no logic changes, only structural splits. Each resulting file should have a single clear responsibility and stay under ~400 lines.
**3.1 Split `services/search/search_logic.py` (1,891 lines)**
Extract into focused modules inside `services/search/`:
* `scoring.py` — `_similarity_from_distance`, `_should_bonus`, `_score_person`, `_collapse_and_rank_persons`, `_apply_post_rank_tiebreakers` and all scoring weight constants
* `candidates.py` — `_lexical_candidates`, `_lexical_candidates_relaxed`, `_fetch_candidate_rows_for_filter_ctx`, `_fetch_candidates_with_fallback`, `_fetch_candidates_lexical_only`, `_apply_card_filters`, `_FilterContext`
* `why_matched.py` — `_generate_llm_why_matched`, `_update_why_matched_async`, `_why_matched_fallback_all`, `_build_person_why_evidence` (note: `why_matched_helpers.py` already exists; merge these in)
* `results.py` — `_build_search_people_list`, `_prepare_pending_search_rows`, `_persist_search_results`, `_load_child_only_cards`, `_load_people_profiles_and_children`, `_PendingSearchRow`
* Keep `search_logic.py` as the orchestrator only — `run_search`, `load_search_more`, `list_searches`, `delete_search` (the public API), importing from the above modules
**3.2 Split `services/experience/pipeline.py` (1,736 lines)**
Extract into focused modules inside `services/experience/`:
* `rewrite.py` — `rewrite_raw_text`, rewrite cache (`_REWRITE_CACHE`, `_rewrite_cache_get`, `_rewrite_cache_set`), `_LLM_TOKENS_REWRITE` constant
* `extraction.py` — all LLM response Pydantic models (`Card`, `CardFamily`, `TimeInfo`, `LocationInfo`, `RoleInfo`, `EntityInfo`), `_normalize_roles`, `parse_llm_response_to_families`, child normalisation helpers, `detect_experiences`, `run_draft_single`
* `field_extractors.py` — `parse_date_field`, `_extract_dates_from_text`, `extract_time_fields`, `extract_location_fields`, `extract_company`, `extract_team`, `extract_role_info`, `normalize_card_title`
* `persistence.py` — `card_to_experience_card_fields`, `card_to_child_fields`, `persist_families`, `serialize_card_for_response`
* `fill_missing.py` — `fill_missing_fields_from_text` and related helpers
* Keep `clarify.py` as-is (already focused), move clarify orchestration functions (`_run_clarify_flow`, `clarify_experience_interactive`) from `pipeline.py` into `clarify.py`
* Keep `pipeline.py` as the public API re-export module only (like `__init__.py` but named pipeline for backward compat)
**3.3 Split `services/builder/engine.py` (696 lines)**
This is less urgent but extract:
* `builder_extraction.py` — LLM call helpers and parsing
* `builder_session.py` — session state management
* Keep `engine.py` as the thin orchestrator / public API
## Phase 4 — Frontend: Remove Duplication & Split Large Components
Goal: one source of truth per concern, components under ~300 lines.
**4.1 Consolidate `types/index.ts` and `lib/schemas.ts`**
Currently `types/index.ts` re-declares API types (`ExperienceCard`, `ExperienceCardCreate`, `ExperienceCardPatch`, `PersonSearchResult`, etc.) that logically belong next to the API client. Move all API response/request types into `lib/types.ts` (a new file). Keep `lib/schemas.ts` for Zod validation schemas only. Update `types/index.ts` to just re-export from `lib/types.ts` for backward compatibility.
**4.2 Split `builder-chat.tsx` (757 lines)**
Extract into:
* `builder-chat-input.tsx` — the message input area and voice toggle
* `builder-chat-messages.tsx` — message list rendering
* `builder-chat-actions.tsx` — action buttons (save, discard, etc.)
* `builder-chat.tsx` keeps only state management and coordination
**4.3 Split `card-details.tsx` (599 lines)**
Extract field sections into separate sub-components:
* `card-details-header.tsx` — title, role, company
* `card-details-time-location.tsx` — dates, location fields
* `card-details-children.tsx` — child card sections (skills, tools, etc.)
**4.4 Move logic out of large page files**
For `cards/page.tsx` (416 lines), `settings/page.tsx` (345 lines), `searches/page.tsx` (339 lines): extract the heavy logic/render into dedicated components in `components/` and keep page files thin (under ~100 lines of actual JSX).
* `cards/page.tsx` → extract to `components/cards/cards-page.tsx`
* `settings/page.tsx` → extract to `components/settings/settings-page.tsx`
* `searches/page.tsx` → extract to `components/searches/searches-page.tsx`
## Phase 5 — Add Baseline Tooling
Goal: establish minimum quality gates that a professional codebase has.
**5.1 Backend: `ruff` config**
Add `ruff.toml` at `apps/api/` with rules: `E`, `F`, `I` (imports), `UP` (pyupgrade). Run `ruff check --fix` to clean up all existing violations. Add a `pyproject.toml` `[tool.ruff]` section.
**5.2 Backend: Add a `Makefile` or `justfile` at `apps/api/`**
Standard commands: `make dev`, `make migrate`, `make lint`, `make seed`. Removes the need to remember uvicorn flags.
**5.3 Frontend: Ensure `eslint` config is correct**
Verify `apps/web` has an ESLint config. Run `npm run lint` and fix all warnings. Add `"strict": true` to `tsconfig.json` if not already set.
**5.4 Add a basic test skeleton**
Create `apps/api/tests/` with:
* `conftest.py` — async test DB session fixture
* `test_search_scoring.py` — unit tests for `_score_person`, `_similarity_from_distance` (pure functions, no DB needed)
* `test_pipeline_field_extractors.py` — unit tests for `parse_date_field`, `extract_time_fields`
These cover the most critical, pure logic and require no mocking.
## Execution Order
Phases are ordered to avoid broken imports:
1. Phase 1 (housekeeping — safe, no imports affected except nav component)
2. Phase 2 (delete facade + dead code — small targeted changes)
3. Phase 3.1 (split search_logic — highest impact, do first among splits)
4. Phase 3.2 (split pipeline)
5. Phase 3.3 (split engine — lower priority)
6. Phase 4 (frontend — independent of backend)
7. Phase 5 (tooling — last, since it runs against clean code)
Each phase should be committed separately so git history stays readable.