### 1. Project Summary

- **What SEARCH_ENGINE is**: A person-centric search and profiling system that turns messy human narratives (text or voice) into normalized, embedded “experience cards” and uses them to power search over people, experiences, and skills.
- **Core problem it solves**: Traditional search over profiles (CVs, LinkedIn-style data) misses nuance, structure, and intent. This system extracts structured experience, skills, metrics, and context from free-form stories, embeds them, and ranks people and experiences by relevance to a query and constraints.
- **Who it is for**: Teams that need to search across people and their experiences (e.g. hiring, sourcing, matching, expert search, relationship intelligence) and AIs that want a structured, queryable layer over human career/experience data.

### 2. User Experience

- **Overall experience**
  - Authenticated users interact via a web app with:
    - A **Builder** that turns narratives into structured experience cards.
    - A **Search / Explore** flow that returns ranked people with “why matched” explanations.
    - An **Inbox** for conversation-style messaging.
    - **People pages** showing an individual’s profile and cards.
  - Voice is available as a **conversational capture surface** (via Vapi + Convai) that shares the same underlying card schema.

- **Main journeys**
  - **Capture experiences**
    - User opens the Builder, is greeted with an LLM-generated opener.
    - They type a long description of what they’ve done (or speak via voice).
    - The system detects discrete experiences, drafts a card, asks targeted clarification questions, then finalizes and persists searchable cards.
  - **Search for people**
    - User runs a search; results render as `PersonResultCard` items with a headline, similarity %, and “why matched” bullets.
    - Clicking a card opens a person detail page with deeper context (experience cards, profile).
  - **Converse**
    - Inbox threads show chat-style conversations with typing states, timestamps, and media hints.
    - Voice sessions use an animated `AiSphere` affordance to start/stop calls.

- **Product feel**
  - Feels like a mix of **chat + structured editor + search engine**.
  - Copy and flows focus on **gentle guidance**: specific follow-up questions, warm onboarding, and clear “why matched” reasons.
  - Visually, UI uses modern motion (Framer Motion), gradients, and pill-style elements; experiences are card-centric rather than raw text blobs.

### 3. Core Product Flow

- **End-to-end flow (typed Builder)**
  1. **User input**: User types a messy narrative about their work/experiences into the Builder.
  2. **Rewrite & detection**:
     - Backend rewrites text into clean English and detects distinct experiences.
     - If there are multiple, the user is asked which one to focus on.
  3. **Card drafting**:
     - For the chosen experience, the pipeline runs an extract prompt to produce a **parent experience card** plus **child dimension cards** (skills, tools, metrics, etc.).
     - The draft is persisted as a `RawExperience` + `DraftSet` + `ExperienceCard` + `ExperienceCardChild` rows (no embeddings yet).
  4. **Clarification loop**:
     - Planner prompt decides which single field or dimension to clarify next.
     - Question writer prompt turns that into a natural question.
     - Answer-applier prompt turns the user’s reply into a minimal patch on the card family.
     - Loop continues until cards are “good enough” or limits are reached.
  5. **Finalize & embed**:
     - On completion, `/experience-cards/finalize` marks the parent visible and runs embeddings for parent and children.
     - Search documents are derived from normalized fields and child items; vectors are stored on cards.
  6. **Searchability**:
     - Finalized cards feed into the search/retrieval layer and appear in search and profile views.

- **Voice flow (Convai / Vapi)**
  - Frontend creates a Vapi client pointed at the `/convai` proxy with a per-user custom LLM URL.
  - Vapi streams audio → Convai backend, which uses our custom chat completions endpoint to run a voice-tailored pipeline (ultimately oriented around the same experience card schema).
  - Transcript snippets appear in Builder chat; when calls end, related experience card families are refreshed so voice-generated cards show up in “Your Cards” / people profiles.

- **Search & ranking**
  - Search runs over embedded parents and children:
    - Parent embeddings from `build_parent_search_document` (title, role, company, domain, summary, raw text, dates, intent, etc.).
    - Child embeddings from `get_child_search_document` (skills/tools/metrics labels and descriptions).
  - Results are **person-centric**: `PersonSearchResult` aggregates cards per person.
  - Graph-based features (`graph_view`) compute additional per-person signals (dimensions present, domain/company alignment, marketing/cross-functional hints, startup+metrics, etc.) and convert them into a small **graph bonus** that nudges ranking without overwhelming similarity.

- **Onboarding / messaging**
  - Inbox flows are standard optimistic-chat patterns with graceful loading, status indicators, and light personalization (avatars based on initials).
  - Conversations can be used alongside search to deepen relationships with surfaced people.

### 4. High-Level Architecture

- **Frontend (apps/web)**
  - Next.js app using client components for interactive surfaces.
  - Major surfaces:
    - `builder/page.tsx` + `BuilderChat`: experience capture, stage machine, clarify flow, voice trigger.
    - `searches`, `explore`, `people/[id]`: search and profile experiences (person-centric, card-based).
    - `inbox/*`: conversation UI with optimistic updates.
  - Styling: Tailwind-style utility classes, motion via Framer Motion, design system components under `components/ui/*`.

- **Backend (apps/api)**
  - FastAPI-based service with routers for:
    - Builder (`/experience-cards/*` endpoints).
    - Search (`run_search` and graph view helpers).
    - Convai (`/convai/*` for voice call proxy and custom LLM endpoint).
  - Experience pipeline orchestrated in `services/experience/pipeline.py`, with supporting modules for clarify logic, embedding, CRUD, and search document construction.

- **Database**
  - Core models:
    - `Person`: entity being searched over.
    - `RawExperience`: raw + cleaned input text blobs.
    - `DraftSet`: grouping of pipeline runs.
    - `ExperienceCard`: parent experience card with normalized fields and an embedding vector.
    - `ExperienceCardChild`: per-dimension children (skills, tools, metrics, etc.) with JSONB `value` (`raw_text`, `items`) and an embedding.
  - Normalized “*_norm” fields allow indexed filters on domains, companies, subdomains, teams.

- **Search / retrieval**
  - Derived **search documents** for parents and children capture the textual content used for embeddings.
  - Vector search runs over these embeddings, combined with:
    - Hard constraints (domains, companies, etc.).
    - Soft “should” constraints (skills/tools/keywords).
    - Graph-derived feature bonuses from `graph_view`.
  - Results are aggregated at person level and exposed as `PersonSearchResult` with similarity %, reasons, and graph extras.

- **LLM / AI layer**
  - LLM prompts (rewrite, detect, extract, clarify planner, question writer, answer applier, profile reflection) live in `prompts/experience_card.py` and friends.
  - A shared **Card/Family** Pydantic model is the bridge between LLM JSON and DB models.
  - Clarify planner / question / apply are carefully separated to:
    - Enforce field-level targeting.
    - Avoid generic “tell me more” questions.
    - Keep the clarifier stateful but auditable.

- **Embeddings / vector search**
  - Embedding creation is centralized in `embedding.py`:
    - `build_embedding_inputs` builds embedding texts for parents and children.
    - `fetch_embedding_vectors` calls the provider and assigns vectors to ORM objects.
  - Embeddings are refreshed whenever cards/children are finalized or patched.

- **Ranking / relevance**
  - Base similarity from vector search over parent/child texts.
  - `graph_view` computes:
    - Presence of high-value dimensions (metrics, collaborations, skills/tools, achievements, domain knowledge).
    - Domain/company alignment with query constraints.
    - Marketing and cross-functional signals from child text and summaries.
    - Startup + metrics patterns.
  - A bounded “graph bonus” (max ~0.10) is added on top of similarity to re-rank people.

- **Voice agent flow**
  - `convai.py` exposes:
    - **Call proxy** that builds a per-user Vapi assistant pointing back at our custom LLM endpoint.
    - **OpenAI-compatible chat completions** endpoint that:
      - Recovers `conversation_id` / `user_id` from query/headers.
      - Calls `convai_chat_turn` with DB access and session state.
      - Streams back SSE chunks compatible with Vapi.
  - Voice sessions use a **long-turn-friendly config** (high silence timeout, custom endpointing rules keyed to “thank you”/“that’s all”).

### 5. Key Technical Concepts

- **Data storage**
  - Experiences are modeled as:
    - Parent `ExperienceCard` rows with normalized, search-oriented fields.
    - Child `ExperienceCardChild` rows for each dimension, each storing a `value` container with `raw_text` and a list of `{ title, description }` items.
  - Raw narrative text is preserved in `RawExperience` and on cards for traceability.

- **Search behavior**
  - At a high level:
    - Text → rewrite → detect → extract → clarify → normalized cards → embeddings.
    - Queries hit a vector index over parent and child embeddings, filtered by domain/company/etc.
    - Graph signals refine ranking to favor “rich” profiles that match query intent.

- **Experience / card structure**
  - Parent card:
    - Identity/time/location: title, normalized_role, domain, sub_domain, company_name/type, team, start/end dates, is_current, location (city/country/remote).
    - Semantics: intent_primary/secondary, seniority_level, employment_type, confidence_score.
    - Narrative: summary + raw_text.
  - Children:
    - `child_type` in `ALLOWED_CHILD_TYPES` (skills, tools, metrics, achievements, responsibilities, collaborations, domain_knowledge, exposure, education, certifications).
    - `value.items` are short labeled bullets.

- **Ranking & retrieval**
  - Primary relevance from semantic similarity between query and search documents.
  - Additional features from `PersonGraphFeatures`:
    - Dimension coverage (how many child types present).
    - Domain + company matches vs. MUST constraints.
    - Marketing / cross-functional / startup + metrics composites, gated by query signals.

- **Pipelines / orchestration**
  - Pipeline is explicit and stateful but **LLM calls are isolated** behind:
    - Typed DTOs (request/response schemas).
    - Functions that strip fences, parse JSON, normalize shapes, and enforce invariants.
  - Clarify is a separate mini-pipeline layered on top of extraction, not baked into the original extract.

### 6. Current Strengths

- **Strong experience modeling**
  - Rich, well-typed schema for experiences and child dimensions with explicit enums and normalized fields.
  - Clear separation of parent experience vs. dimension children.

- **LLM prompt architecture**
  - Prompts are modular (rewrite, detect, extract, clarify) with explicit JSON contracts and validation.
  - Clarify planner prevents generic or repetitive questions and encodes domain-specific rules (e.g. when company_name is inapplicable).

- **Search & ranking**
  - Search documents are derived systematically from card fields and child values.
  - Graph features add **interpretable, domain-specific ranking nudges** (startup/metrics, marketing, cross-functional) without dominating similarity.

- **Voice integration**
  - Convai / Vapi integration is cleanly isolated in its own router, with custom LLM endpoints and session management.
  - Voice uses OpenAI-compatible streaming, making it easy to swap or extend models.

### 7. Current Gaps / Open Problems

- **UX completeness**
  - Voice-generated cards rely on indirect refresh flows; UI does not yet fully unify text and voice Builder experiences into a single coherent timeline.
  - Clarify loop is powerful but can feel opaque to users (no visual progress indicator or “fields filled so far” overview).

- **Search quality / explainability**
  - `why_matched` strings come directly from the backend but are only lightly surfaced; there is room for richer, consolidated explanations combining vector hits, graph features, and constraints.
  - Graph bonus currently encodes a small, fixed set of patterns (marketing/startup/metrics); broader semantic graph features are possible but not yet implemented.

- **Architecture / scaling**
  - Embedding and clarify logic rely on synchronous LLM calls per interaction; throughput and latency tuning for higher QPS is not fully addressed (no explicit background workers or batching).
  - Rewrite/detect/extract/clarify are tightly coupled to a single provider interface; multi-model routing or fallback is not yet encoded.

- **Voice flow**
  - Voice relies on in-process session storage; multi-instance / horizontally scaled deployments may need shared state (e.g. Redis) to keep sessions consistent across pods.
  - Error paths and UX hints around callback misconfiguration are present but still developer-focused rather than user-friendly.

### 8. What Feedback We Want From Another AI

- **Architecture suggestions**
  - How to best separate synchronous user flows from heavier LLM/embedding work (queues, workers, streaming patterns).
  - Patterns for making clarify and search more resilient to provider failures or schema drift.

- **UX improvements**
  - Ways to expose the clarify planner state and card completeness to users without overwhelming them.
  - Better unification of text, voice, and manual editing into a single “experience timeline” per person.

- **Search / ranking ideas**
  - More expressive graph features (e.g. multi-hop reasoning over domains, skills, and companies).
  - Techniques for calibrating similarity scores and bonuses so “good but unusual” profiles are surfaced, not buried.

- **Voice agent smoothness**
  - Prompting and state strategies to make long storytelling sessions more structured and less repetitive, while still feeling conversational.
  - Ideas for mapping voice sessions more directly into draft/clarify/finalize steps with minimal friction.

- **Data model improvements**
  - Suggestions for additional child dimensions or intent fields that meaningfully improve matching without overcomplicating the schema.
  - Normalization strategies for companies, domains, and locations to improve cross-organization search.

- **Performance / scalability**
  - Caching and batching strategies for rewrite/detect/extract/clarify and embedding calls.
  - Indexing and partitioning approaches for large volumes of experience cards and children while maintaining fast person-centric search.

