# Copilot Instructions for CONXA

CONXA is a hybrid semantic search platform for people by experience. Users build AI-assisted Experience Cards (voice + text chat), and searchers run natural-language queries returning ranked people with "why matched" explanations.

## Monorepo Structure

```
apps/
  api/   — FastAPI backend (Python 3.13, async SQLAlchemy, PostgreSQL + pgvector)
  web/   — Next.js 16 frontend (TypeScript, Tailwind, Radix UI, React Query)
```

## Commands

### Backend (`apps/api/`)

```bash
# Dev server
uvicorn src.main:app --reload

# Lint
ruff check src/
ruff format src/

# Migrations
alembic upgrade head
alembic revision --autogenerate -m "description"

# Tests (currently minimal)
pytest
pytest tests/test_file.py::test_name -v  # single test
```

### Frontend (`apps/web/`)

```bash
npm run dev      # dev server
npm run build    # production build
npm run lint     # eslint
```

## Backend Architecture

### Request Flow

`src/routers/<domain>.py` → `src/services/<domain>/` → `src/db/models.py`

Routers are thin; business logic belongs in services.

### Key Files

| File | Purpose |
|------|---------|
| `src/domain.py` | **Single source of truth** for all domain types, enums, Pydantic schemas |
| `src/db/models.py` | SQLAlchemy ORM table definitions |
| `src/core/config.py` | Settings via `get_settings()` — never use `os.environ` directly |
| `src/core/constants.py` | Shared constants including `EMBEDDING_DIM = 324` |
| `src/dependencies.py` | FastAPI deps: `get_db`, `get_current_user` |
| `src/serializers.py` | ORM → response schemas (use these, not inline dicts) |
| `src/providers/chat.py` | LLM abstraction via `get_chat_provider()` |
| `src/providers/embedding.py` | Embedding abstraction via `get_embedding_provider()` |
| `src/prompts/` | All LLM prompts — never inline in services |
| `src/services/search/search_logic.py` | Full search pipeline (`run_search`) |
| `src/services/credits.py` | Credit ledger: `deduct_credits()`, `get_balance()` |

### Critical Invariants

1. **Embedding dimension is 324 everywhere** — changing requires Alembic migration
2. **`src/domain.py` is the single source of truth** — import `Intent`, `SeniorityLevel`, etc. from there
3. **`experience_card_visibility = True` gates search** — draft cards are invisible
4. **Never call LLM/embedding APIs directly** — always use `get_chat_provider()` / `get_embedding_provider()`
5. **Credits via `deduct_credits()` only** — `credit_ledger` is append-only
6. **Idempotency keys on `/search` and `/unlock-contact`** — check `get_idempotent_response()` before work
7. **All DB access is async** — use `async with async_session()` or the `get_db` dependency

### Search Pipeline (`run_search`)

1. Idempotency check
2. LLM parses query → `ParsedConstraintsPayload` (MUST/SHOULD/EXCLUDE constraints)
3. Parallel: embed query vector + lexical full-text candidates
4. Fetch vector candidates with fallback tiers
5. Collapse by person; blended scoring
6. Create Search record, deduct credits
7. LLM generates "why matched" bullets
8. Persist SearchResult rows, return response

### DB Gotchas

- `user_id` on `ExperienceCard` is a synonym for `person_id` — use `person_id` in new code
- `updated_at` only set on update, not insert
- Child card `value` is JSONB: `{ raw_text, items: [{ title, description }] }`

## Frontend Architecture

### Key Directories

```
src/app/(authenticated)/  — Auth-guarded pages (layout.tsx enforces)
src/app/(landing)/        — Marketing pages
src/components/builder/   — Experience card builder
src/components/search/    — Search UI
src/components/ui/        — Radix-based primitives
src/contexts/             — auth-context.tsx, search-context.tsx
src/hooks/                — React Query hooks (one per domain)
src/lib/api.ts            — All HTTP calls — never use fetch directly
src/lib/schemas.ts        — Zod form validation schemas
```

### Key Patterns

- **API calls**: always use `src/lib/api.ts` functions (`api()`, `apiWithIdempotency()`)
- **Data fetching**: use React Query hooks from `src/hooks/`
- **Forms**: `react-hook-form` + Zod from `src/lib/schemas.ts`
- **Auth**: authenticated pages rely on `(authenticated)/layout.tsx`

## Environment Variables

### Backend (`apps/api/.env`)

- `DATABASE_URL` — PostgreSQL with pgvector extension
- `JWT_SECRET` — JWT signing
- `CHAT_API_BASE_URL` / `CHAT_MODEL` — OpenAI-compatible LLM
- `EMBED_API_BASE_URL` / `EMBED_MODEL` — Embedding endpoint
- `EMBED_DIMENSION` — Must match DB (default: 324)
- `CORS_ORIGINS` — Explicit origins (not `*` with credentials)

### Frontend (`apps/web/.env.local`)

- `NEXT_PUBLIC_API_BASE_URL` — Backend URL
- `NEXT_PUBLIC_VAPI_PUBLIC_KEY` / `NEXT_PUBLIC_VAPI_ASSISTANT_ID` — Voice integration
