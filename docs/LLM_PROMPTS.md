# LLM prompts in CONXA

This document lists **prompt templates and builders** in the repo, **why** they exist, and **where** they run. All chat-style calls go through `get_chat_provider()` in `apps/api/src/providers/chat.py` unless noted.

**Not in this repo:** Voice assistants (Vapi) are configured in the Vapi dashboard; variable injection from the app is documented in [`apps/api/docs/VAPI_EDIT_ASSISTANT_PROMPT.md`](../apps/api/docs/VAPI_EDIT_ASSISTANT_PROMPT.md) and related files under `apps/api/docs/`.

---

## Search pipeline

| Prompt | Source | Why |
|--------|--------|-----|
| **Search query cleanup** (`PROMPT_SEARCH_CLEANUP`) | `apps/api/src/prompts/search_filters.py` | Normalizes typos and spacing **without adding facts**, so the next step (structured extraction) and embeddings see stable text while preserving names, companies, and numbers exactly. |
| **Single-query extraction** (`PROMPT_SEARCH_SINGLE_EXTRACT`) | `apps/api/src/prompts/search_filters.py` | Turns natural language into **JSON constraints** (`must` / `should` / `exclude`), `query_embedding_text`, `search_phrases`, `num_cards`, etc., aligned with DB fields and ranking. Uses `INTENT_ENUM` from `domain` for valid intents. |
| **Why matched** (`get_why_matched_prompt`) | `apps/api/src/prompts/search_why_matched.py` | After retrieval, produces **1–3 short, grounded reasons per person** from compact evidence only—compressed, deduped, query-relevant; avoids copying noisy labels or inventing facts. |

**Flow:** `OpenAICompatibleChatProvider.parse_search_filters()` runs cleanup then extraction (`apps/api/src/providers/chat.py`). Why-matched runs in `apps/api/src/services/search/why_matched_helpers.py`.

---

## Experience Card pipeline (text → structured cards)

Ordered roughly as used in onboarding / card creation:

| Prompt | Source | Why |
|--------|--------|-----|
| **Rewrite** (`PROMPT_REWRITE`) | `apps/api/src/prompts/experience_card.py` | Makes messy input **grammatically clear and parseable** without changing meaning, adding facts, or summarizing—feeds safer downstream JSON extraction. Used by `apps/api/src/services/experience/rewrite.py`. |
| **Extract single experience** (`PROMPT_EXTRACT_SINGLE_CARDS`) | `apps/api/src/prompts/experience_card.py` | After rewrite inside `run_draft_single`, extracts **one** parent card + dimension children (`metrics`, `tools`, etc.). Builder transcript commit uses **1 of 1** (one card per commit). Enums from `domain` (`Intent`, `SeniorityLevel`, …). |
| **Fill missing fields** (`PROMPT_FILL_MISSING_FIELDS`) | `apps/api/src/prompts/experience_card.py` | **Targeted patch** for empty fields only when updating from messy text (`fill_missing.py`)—does not overwrite existing values; optional append instructions for child `items`. |

---

## Builder (conversation-first engine)

| Prompt | Source | Why |
|--------|--------|-----|
| **Fast turn** (`build_fast_turn_prompt`) | `apps/api/src/prompts/builder_conversation.py` | Drives the **chat UI**: natural back-and-forth to understand **one** experience thread, updates hidden state + `working_narrative`, and decides when to stop—**without** extracting schema in the LLM (that happens later). Extra rules apply in **voice** mode (short replies, no duplicate “what did you do” loops, tolerate STT errors). Used by `apps/api/src/services/builder/roles.py`. |
| **Commit synthesis** (`build_commit_synthesis_prompt`) | `apps/api/src/prompts/builder_conversation.py` | **Not user-facing.** Produces `extraction_input`: a clean, grounded narrative for the **downstream extraction pipeline** after the conversation ends (`roles.py`). |

---

## Translation (OpenAI-compatible path only)

| Prompt | Source | Why |
|--------|--------|-----|
| **Batch translate instruction** (inline string) | `apps/api/src/providers/translation.py` | When `TRANSLATION_PROVIDER=openai`, asks the model to translate a list of lines **in order**, one output line per input—used for UI/API copy in the viewer’s language. **Sarvam** translation does not use this prompt. |

---

## Helper

| Name | Source | Why |
|------|--------|-----|
| **`fill_prompt()`** | `apps/api/src/prompts/experience_card.py` | Substitutes placeholders (`{{USER_TEXT}}`, `{{CLEANED_TEXT}}`, enums, etc.) so templates stay readable and enums stay synced with `src/domain.py`. |

---

## Quick file map

| Area | Primary files |
|------|----------------|
| Search cleanup + extract | `prompts/search_filters.py`, `providers/chat.py` |
| Why matched | `prompts/search_why_matched.py`, `services/search/why_matched_helpers.py` |
| Experience rewrite / detect / extract / fill | `prompts/experience_card.py`, `services/experience/*.py` |
| Builder chat | `prompts/builder_conversation.py`, `services/builder/roles.py` |
| Translation (LLM) | `providers/translation.py` |

---

## Embeddings

Embedding calls use **model inputs only** (query text, document text)—no separate prompt templates in `src/prompts/`. Configuration is via `get_embedding_provider()` and `apps/api/src/core/config.py`.
