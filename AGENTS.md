# AGENTS.md

This file provides guidance to AI coding assistants and tools (e.g. Cursor, WARP) when working with code in this repository.

## What this project is
CONXA is a hybrid semantic search platform for people by experience. Users build structured **Experience Cards** (AI-assisted, with voice and text chat). Searchers run natural-language queries and get ranked people with "why matched" explanations. The app supports **viewer language** (UI copy and some API payloads translated/cached per `PersonProfile.preferred_language`).

## Monorepo structure
```
apps/
  api/   — FastAPI backend (Python 3.13, async SQLAlchemy, PostgreSQL + pgvector)
  web/   — Next.js 16 frontend (TypeScript, Tailwind, Radix UI, React Query)
scripts/
  ngrok-tunnel.ps1  — Expose local API via ngrok (for mobile/Vapi testing)
```

## Commands

### Backend (`apps/api/`)
```bash
# Run dev server
uvicorn src.main:app --reload

# Or: make dev   (same, from apps/api/)

# Lint (check and format)
ruff check src/
ruff format src/

# Or: make lint / make format

# Run migrations
alembic upgrade head

# Or: make migrate
```

Optional dev dependencies (Ruff, pytest, etc.): `pip install -e ".[dev]"` from `apps/api/`. There is a `Makefile` with `dev`, `migrate`, `lint`, `format`, and `test` targets. **Automated tests are not yet meaningfully populated** (`pytest` is configured but the suite is minimal or empty).

### Frontend (`apps/web/`)
```bash
# Run dev server
npm run dev

# Build
npm run build

# Lint (ESLint, repo root from apps/web/)
npm run lint
```

## Backend architecture

### Request flow
`src/routers/<domain>.py` → `src/services/<domain>/` → `src/db/models.py` (via `async_session`)

Routers are registered in `src/routers/__init__.py`. Keep routers thin; business logic belongs in services.

### Key files
| File | Purpose |
|---|---|
| `src/domain.py` | **Single source of truth** for all domain types, enums, Pydantic schemas. Change types here first. |
| `src/db/models.py` | All SQLAlchemy ORM table definitions. |
| `src/db/session.py` | `async_session` factory; `Base` subclasses SQLAlchemy `DeclarativeBase`. |
| `src/core/config.py` | All settings via `get_settings()` (lru_cache). Read env here — never `os.environ` directly. |
| `src/core/constants.py` | Shared constants, notably `EMBEDDING_DIM = 324`. |
| `src/dependencies.py` | FastAPI dependencies: `get_db`, `get_current_user`, card lookup helpers. |
| `src/serializers.py` | Converts ORM models → response schemas. Use these instead of building dicts in routers/services. |
| `src/providers/chat.py` | LLM abstraction. Always use `get_chat_provider()`. |
| `src/providers/embedding.py` | Embedding abstraction. Always use `get_embedding_provider()`. |
| `src/providers/translation.py` | Translation abstraction (Sarvam or OpenAI-compatible). Always use `get_translation_provider()`. |
| `src/prompts/` | All LLM prompts. Never inline prompts in service files. Enum snippets used by search cleanup live in `prompts/experience_card.py` (e.g. `INTENT_ENUM`). |
| `src/services/search/` | Search pipeline split across modules: `search_logic.py` (`run_search`, list/load/delete), `candidates.py`, `scoring.py`, `why_matched.py`, `search_profile_view.py`, etc. |
| `src/services/search.py` | **Facade** that re-exports the public search/profile/unlock API for `from src.services import search_service`. Implementation delegates into `src/services/search/`. |
| `src/services/experience/pipeline.py` | Experience card creation/update pipeline. |
| `src/services/builder/engine.py` | AI builder engine (chat + voice transcript → structured card fields). |
| `src/services/locale_display.py` | Builds/caches localized profile and search payloads for a viewer language. |
| `src/services/translation.py` | Higher-level translation helpers (uses provider + DB translation cache). |
| `src/services/speech/` | Server-side speech-to-text (Sarvam) used by `/speech/transcribe`. |
| `src/services/credits.py` | Credit ledger: `deduct_credits()`, `get_balance()`. |
| `src/routers/speech.py` | Authenticated audio upload → transcript (API key stays on server). |

### Critical invariants
1. **Embedding dimension is 324 everywhere**: `EMBEDDING_DIM` in `constants.py`, `_EMBEDDING_DIM` in `models.py`, `embed_dimension` default in `config.py`, and the `Vector(324)` column on `ExperienceCard` and `ExperienceCardChild`. Changing this requires an Alembic migration.
2. **`src/domain.py` is the single source of truth** for domain types. Do not redefine `Intent`, `SeniorityLevel`, `EmploymentType`, etc. — import from `domain`.
3. **`experience_card_visibility = True` gates search.** Draft cards are invisible to search queries.
4. **Never call LLM, embedding, or translation HTTP APIs directly.** Use `get_chat_provider()`, `get_embedding_provider()`, and `get_translation_provider()` so models and vendors stay swappable via `.env`.
5. **Credits must be deducted atomically** via `deduct_credits()`. `credit_ledger` is append-only — never delete rows or manually update `PersonProfile.balance`.
6. **Idempotency keys** on `/search` and `/unlock-contact`: always check `get_idempotent_response()` before work, then `save_idempotent_response()` after.
7. **All DB access is async.** Use `async with async_session()` or the `get_db` FastAPI dependency. Never use sync SQLAlchemy sessions.

### Search pipeline (`run_search` in `search_logic.py`)
1. Idempotency check
2. LLM parses query → `ParsedConstraintsPayload` (MUST / SHOULD / EXCLUDE constraints); persisted on `Search.parsed_constraints_json` (JSONB).
3. Parallel: embed query vector + lexical full-text candidates
4. Fetch vector candidates with fallback tiers: strict → time soft → location soft → company/team soft
5. Collapse by person; blended score: `0.55 × parent_best + 0.30 × child_best + 0.15 × avg_top3 + lexical_bonus + should_bonus + graph_bonus − penalties`
6. Create Search record, deduct credits
7. LLM generates "why matched" bullets (with deterministic fallback)
8. Persist SearchResult rows; optional **locale pass** for viewer language; return response

### DB gotchas
- `user_id` on `ExperienceCard` is a SQLAlchemy synonym for `person_id` (backward compat). Use `person_id` in new code.
- `updated_at` is only set on update (`onupdate`), not on insert. Don't rely on it for new rows.
- `SEARCH_NEVER_EXPIRES = datetime(9999, ...)` — searches don't expire by default.
- Child card `value` field is JSONB: `{ raw_text, items: [{ title, description }] }`. Always write/read this shape.
- Lexical search uses `to_tsvector('english', ...)` — won't index non-English content well.
- `domain_norm` and `sub_domain_norm` are lowercased normalized fields added in a later migration. Filter logic falls back to `ilike` on the raw field for older rows.
- `PersonProfile.preferred_language`, `localized_ui_cache_json`, and the `translation_cache` table support i18n; see `locale_display` and migrations `032`–`034`.

## Frontend architecture

### App structure
```
src/app/
  (authenticated)/   — Route group for all pages requiring auth; layout.tsx enforces auth guard
  (landing)/         — Marketing/landing pages
  login/, signup/    — Auth pages
  onboarding/        — Includes language selection (among other steps)
src/components/
  builder/           — Experience card builder (chat panel, voice, form fields, family tree view)
  search/            — Search form and result cards
  common/            — Shared chrome (e.g. auth background `AuthBg` / `DepthGrid`)
  ui/                — Radix-based shared UI primitives (do not install new UI libs without good reason)
src/contexts/
  auth-context.tsx   — JWT + current user state. Wrap with this before accessing user data.
  search-context.tsx — Shared search UI state across the search flow.
  language-context.tsx — Viewer language; `LanguageProvider` wraps the app in `app/layout.tsx`.
src/hooks/           — React Query data-fetching hooks, one per domain concept.
src/lib/
  api.ts             — All HTTP calls (api, apiWithIdempotency, apiBlob, apiUpload). Never use fetch directly in components.
  types.ts           — Shared TypeScript types for API shapes (prefer this over ad-hoc duplicates).
  schemas.ts         — Zod schemas for form validation.
```

### Key patterns
- **API calls**: always use functions from `src/lib/api.ts`. The `api()` function attaches Bearer tokens and normalizes errors automatically.
- **Data fetching**: use React Query hooks from `src/hooks/`. Don't fetch in page components.
- **Forms**: `react-hook-form` + Zod from `src/lib/schemas.ts`.
- **Auth guard**: authenticated pages rely on `(authenticated)/layout.tsx`. Don't bypass it.
- **API base URL**: set via `NEXT_PUBLIC_API_BASE_URL` in `apps/web/.env.local`.
- **Voice**: Vapi integration uses `NEXT_PUBLIC_VAPI_PUBLIC_KEY` and assistant IDs from `apps/web/.env.local` (builder vs enhance may differ). Home search dictation can use server `/speech/transcribe` so the Sarvam key stays on the API.

## Environment setup
Copy `apps/api/.env.example` → `apps/api/.env` and `apps/web/.env.example` → `apps/web/.env.local`.

Key variables:
| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | `api/.env` | PostgreSQL connection string (must have pgvector extension) |
| `JWT_SECRET` | `api/.env` | JWT signing secret |
| `OPENAI_API_KEY` | `api/.env` | Used when `CHAT_API_BASE_URL` is unset |
| `CHAT_API_BASE_URL` / `CHAT_MODEL` | `api/.env` | OpenAI-compatible LLM (e.g. Groq, vLLM, Ollama) |
| `EMBED_API_BASE_URL` / `EMBED_MODEL` | `api/.env` | Embedding endpoint (default model: `text-embedding-3-large`) |
| `EMBED_DIMENSION` | `api/.env` | Must match DB migration (default: 324) |
| `TRANSLATION_PROVIDER` / `TRANSLATION_API_KEY` | `api/.env` | Sarvam or OpenAI-compatible translation (see `.env.example`) |
| `CORS_ORIGINS` | `api/.env` | Comma-separated allowed origins (use explicit origins in production — `*` won't work with credentials) |
| `NEXT_PUBLIC_API_BASE_URL` | `web/.env.local` | Backend URL, e.g. `http://localhost:8000` |
| `NEXT_PUBLIC_VAPI_PUBLIC_KEY` | `web/.env.local` | Vapi dashboard public key |
| `NEXT_PUBLIC_VAPI_ASSISTANT_ID` | `web/.env.local` | Vapi assistant ID (builder; enhance flow may use additional IDs) |

## Alembic migrations
All migrations are in `apps/api/alembic/versions/`. Always use Alembic — never edit the DB schema manually. Run from `apps/api/`:
```bash
alembic revision --autogenerate -m "description"
alembic upgrade head
```
