---
name: Latency & DB Load Optimization
overview: Systematic reduction of latency and database load across both the FastAPI backend and Next.js frontend, targeting HTTP client reuse, connection pooling, query optimization, parallelization, and frontend rendering/fetching efficiency.
todos:
  - id: http-clients
    content: Persistent httpx.AsyncClient in ChatProvider, EmbeddingProvider, TranslationProvider + lifespan cleanup
    status: pending
  - id: db-pool
    content: Add pool_size, max_overflow, pool_pre_ping, pool_recycle to create_async_engine in session.py
    status: pending
  - id: n-plus-one-chat
    content: Fix N+1 in list_conversations using window function / lateral join
    status: pending
  - id: single-llm-search
    content: Merge cleanup + extract into single LLM call in parse_search_filters
    status: pending
  - id: readonly-commit
    content: Skip commit() on clean sessions in get_db dependency
    status: pending
  - id: provider-singleton
    content: Cache provider instances as singletons (required for persistent clients)
    status: pending
  - id: gather-session-safety
    content: "Audit asyncio.gather sites: separate sessions for parallel DB, keep sequential for same-session"
    status: pending
  - id: dedup-preferred-lang
    content: Load preferred_language once via joined load on Person, pass through
    status: pending
  - id: builder-flush-dedup
    content: Batch child updates + single flush in builder commit_card_draft
    status: pending
  - id: translation-concurrency
    content: Add semaphore-bounded gather for Sarvam sequential translations
    status: pending
  - id: remove-debug-fetch
    content: Remove/gate debug fetch calls to 127.0.0.1:7242 in home-page and voice-dictation
    status: pending
  - id: voice-hook-memo
    content: useMemo on useVoiceDictation return value to stabilize object identity
    status: pending
  - id: query-invalidation
    content: Deduplicate React Query invalidations (families-only instead of cards+families)
    status: pending
  - id: memo-card-rows
    content: React.memo on SavedCardFamily to prevent full-list re-renders on edit
    status: pending
  - id: db-indexes
    content: Add composite index on experience_card_children(parent_experience_id, person_id) and searches(searcher_id)
    status: pending
isProject: false
---

# Latency & Database Load Optimization Plan

The audit uncovered **5 critical** and **10+ medium** issues across backend and frontend. Changes are grouped by impact (highest first) and ordered so each can be landed independently.

---

## TIER 1 -- Critical (biggest latency wins)

### 1. Persistent HTTP clients for LLM / Embedding / Translation providers

Every LLM call, embedding call, and translation call creates **a brand-new `httpx.AsyncClient**`, paying TCP + TLS handshake overhead (~100-300ms) on every request. This is the single largest avoidable latency source -- it happens on every search, every card build, and every translation.

**Fix:** Create a long-lived `httpx.AsyncClient` per provider instance, reuse it across calls, and close it on app shutdown via a FastAPI lifespan handler.

Files:

- `[apps/api/src/providers/chat.py](apps/api/src/providers/chat.py)` -- line 126: `async with httpx.AsyncClient(timeout=60.0) as client:` inside `_chat` loop. Replace with `self._client` initialized in `__init__`.
- `[apps/api/src/providers/embedding.py](apps/api/src/providers/embedding.py)` -- line 45: same pattern in `embed()`.
- `[apps/api/src/providers/translation.py](apps/api/src/providers/translation.py)` -- similar new-client-per-call pattern.
- `[apps/api/src/services/builder/builder_extraction.py](apps/api/src/services/builder/builder_extraction.py)` -- one-shot `httpx.AsyncClient` for Vapi transcript fetch.

Pattern:

```python
class OpenAICompatibleChatProvider(ChatProvider):
    def __init__(self, base_url: str, api_key: str | None, model: str) -> None:
        ...
        self._client = httpx.AsyncClient(
            timeout=60.0,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )

    async def close(self) -> None:
        await self._client.aclose()
```

Add a `close_providers()` coroutine called from FastAPI `lifespan`.

### 2. Database connection pool tuning

`[apps/api/src/db/session.py](apps/api/src/db/session.py)` line 16-20: The engine uses `NullPool` on Render (zero reuse) and default pool elsewhere (no explicit tuning).

**Fix:** Add explicit pool parameters:

```python
engine = create_async_engine(
    database_url,
    echo=os.getenv("SQL_ECHO", "0") == "1",
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=300,
    poolclass=NullPool if "render.com" in database_url else None,
)
```

`pool_pre_ping=True` avoids "stale connection" errors. `pool_recycle=300` prevents Postgres timeout-killing idle connections. Even on Render with `NullPool`, adding `connect_args={"server_settings": {"statement_timeout": "30000"}}` prevents runaway queries.

### 3. Eliminate N+1 in `list_conversations`

`[apps/api/src/services/chat.py](apps/api/src/services/chat.py)` lines 126-141: For each conversation, a **separate SQL query** fetches the latest message -- classic N+1.

**Fix:** Use a window function to fetch all last messages in one query:

```python
from sqlalchemy import over
last_msg_cte = (
    select(
        Message.conversation_id,
        Message.body,
        func.row_number().over(
            partition_by=Message.conversation_id,
            order_by=Message.created_at.desc()
        ).label("rn")
    ).subquery()
)
# Join conversations with their latest message in one query
```

### 4. Search `parse_search_filters` -- two sequential LLM calls to one

`[apps/api/src/providers/chat.py](apps/api/src/providers/chat.py)` lines 217-234: `parse_search_filters` does cleanup LLM call THEN extract LLM call sequentially. Each call is ~500-1500ms.

**Fix:** Merge the cleanup and extraction prompts into a single LLM call that returns the cleaned text + structured constraints in one JSON response. This halves the LLM latency on every search.

### 5. Skip `commit()` on read-only requests

`[apps/api/src/dependencies.py](apps/api/src/dependencies.py)` lines 24-32: `get_db` always `commit()`s after yield, adding a round-trip even for pure reads.

**Fix:** Track whether the session is "dirty" and only commit if needed, or use a separate `get_db_readonly` dependency for read-only endpoints.

```python
async def get_db() -> AsyncGenerator[AsyncSession]:
    async with async_session() as session:
        try:
            yield session
            if session.dirty or session.new or session.deleted:
                await session.commit()
        except Exception:
            await session.rollback()
            raise
```

---

## TIER 2 -- Medium (noticeable improvements)

### 6. Cache provider instances (singleton pattern)

`[apps/api/src/providers/chat.py](apps/api/src/providers/chat.py)` `get_chat_provider()` and `[embedding.py](apps/api/src/providers/embedding.py)` `get_embedding_provider()` create **new provider objects on every call**. With persistent HTTP clients (Tier 1), this must become a singleton.

**Fix:** Use `@lru_cache` or module-level singletons:

```python
_chat_provider: ChatProvider | None = None

def get_chat_provider() -> ChatProvider:
    global _chat_provider
    if _chat_provider is None:
        settings = get_settings()
        ...
        _chat_provider = OpenAICompatibleChatProvider(...)
    return _chat_provider
```

### 7. Fix `asyncio.gather` on shared `AsyncSession`

Multiple places use `asyncio.gather` with DB queries on the **same session** (`[search_logic.py](apps/api/src/services/search/search_logic.py)` line 216, `[candidates.py](apps/api/src/services/search/candidates.py)` lines 192, 397, `[search_profile_view.py](apps/api/src/services/search/search_profile_view.py)` line 57). SQLAlchemy's `AsyncSession` is **not safe for concurrent operations**.

**Fix:** For true parallelism, use separate sessions. For the common case of "LLM call + DB query", gather is fine since only one touches the session. Audit each gather site and either:

- Split into separate sessions for concurrent DB queries
- Keep sequential for same-session DB ops (document the decision)

### 8. Deduplicate `preferred_language` queries

The pattern `SELECT preferred_language FROM person_profiles WHERE person_id = :id` appears in at least 4 places across search logic. Each is a separate round-trip.

**Fix:** Load `preferred_language` once when loading the user profile in `get_current_user` (attach it to the `Person` object via `selectinload` or a joined load), and pass it through.

### 9. Builder router: duplicate `list_children_for_parent` + per-iteration flush

`[apps/api/src/routers/builder.py](apps/api/src/routers/builder.py)`: `commit_card_draft` calls `list_children_for_parent` twice (before and after updates) and does `db.flush()` per child in a loop.

**Fix:** Single `list_children_for_parent` call, batch all child updates, single flush at end.

### 10. Sarvam translation: sequential to concurrent batches

`[apps/api/src/providers/translation.py](apps/api/src/providers/translation.py)` ~lines 203-264: N texts translated sequentially. Even with rate limits, can use `asyncio.Semaphore(3)` + `gather` for controlled concurrency.

---

## TIER 3 -- Frontend optimizations

### 11. Remove debug `fetch("http://127.0.0.1:7242/...")` calls

`[apps/web/src/components/home/home-page.tsx](apps/web/src/components/home/home-page.tsx)` and `[apps/web/src/hooks/use-voice-dictation.ts](apps/web/src/hooks/use-voice-dictation.ts)`: Multiple debug fetch calls to a localhost endpoint that will **fail/timeout in production**, adding seconds of wasted latency.

**Fix:** Remove all debug fetch calls to `127.0.0.1:7242` or gate them behind `process.env.NODE_ENV === "development"`.

### 12. Stabilize `useVoiceDictation` return object identity

`[apps/web/src/hooks/use-voice-dictation.ts](apps/web/src/hooks/use-voice-dictation.ts)`: Returns a new object literal every render, causing `useEffect` dependencies in `[home-page.tsx](apps/web/src/components/home/home-page.tsx)` to fire every render.

**Fix:** Wrap the return value in `useMemo`.

### 13. Double React Query invalidation after mutations

`[apps/web/src/hooks/use-card-mutations.ts](apps/web/src/hooks/use-card-mutations.ts)` and `[use-builder-chat-voice.ts](apps/web/src/components/builder/chat/use-builder-chat-voice.ts)`: Both `EXPERIENCE_CARDS_QUERY_KEY` and `EXPERIENCE_CARD_FAMILIES_QUERY_KEY` are invalidated, causing two parallel refetches of overlapping data.

**Fix:** Only invalidate `EXPERIENCE_CARD_FAMILIES_QUERY_KEY` (which is the superset used by the UI), and remove the cards-only key or make it derive from families.

### 14. Memoize `SavedCardFamily` rows to prevent full-list re-renders

`[apps/web/src/components/cards/cards-page.tsx](apps/web/src/components/cards/cards-page.tsx)`: All family rows share `editForm` state, so editing one card re-renders every row.

**Fix:** Wrap `SavedCardFamily` in `React.memo` and pass callbacks via stable refs.

---

## Database index additions

Add a composite index on `experience_card_children` for the common "load children for a list of parent IDs" pattern used in search results and card families:

```sql
CREATE INDEX ix_experience_card_children_parent_person
ON experience_card_children (parent_experience_id, person_id);
```

Also ensure `searches.searcher_id` has an index (used in `load_search_more` and `list_saved_searches`):

```sql
CREATE INDEX ix_searches_searcher_id ON searches (searcher_id);
```

---

## Expected impact


| Change                      | Latency reduction             | DB load reduction       |
| --------------------------- | ----------------------------- | ----------------------- |
| Persistent HTTP clients     | -100-300ms per LLM/embed call | --                      |
| Pool tuning                 | -50-200ms cold connection     | Less connection churn   |
| N+1 conversations fix       | -N * 5-20ms per conversation  | -N queries              |
| Single LLM for search parse | -500-1500ms per search        | --                      |
| Skip read-only commit       | -5-10ms per read endpoint     | -1 round-trip per read  |
| Provider singletons         | -5ms per provider call        | --                      |
| Remove debug fetches        | -1-15s on voice toggle (prod) | --                      |
| Query deduplication         | -10-30ms per search           | -3-4 queries per search |


