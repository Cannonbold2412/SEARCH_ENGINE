# Vapi voice integration

The web app uses **Vapi** for real-time voice (STT, TTS, WebRTC). The assistant you talk to is configured in the **Vapi dashboard** (system prompt, model, voice, transcriber). This API does **not** expose a custom OpenAI-compatible proxy at `/convai/v1/chat/completions`; experience extraction runs **after** the call when the client posts a transcript (or a Vapi `call_id` for server-side fetch).

## Architecture

| Layer | Role |
|--------|------|
| **Vapi (client)** | `npm` package `@vapi-ai/web` in the Next.js app: connects with the dashboard **public** key + **assistant ID**, handles audio and conversation in Vapi’s cloud. |
| **This API** | Authenticated **`POST /builder/transcript/commit`**: optional `call_id` → fetch full transcript from Vapi’s REST API using **`VAPI_API_KEY`**; then run `detect_experiences` + `run_draft_single` per detected experience (see `services/builder/engine.py`). |

So: conversation = Vapi dashboard assistant; card extraction = our Python pipeline on commit—not streaming LLM turns through this repo.

## Web app configuration

Set in `apps/web/.env.local` (see `apps/web/.env.example`):

- **`NEXT_PUBLIC_VAPI_PUBLIC_KEY`** — Public API key from [dashboard.vapi.ai](https://dashboard.vapi.ai) (safe for the browser).
- **`NEXT_PUBLIC_VAPI_ASSISTANT_ID`** — Assistant ID from the dashboard.

Voice UI components (`builder-chat`, `vapi-voice-widget`) call `createPatchedVapiClient(publicKey)` and `vapi.start(assistantId)`.

## Server (API) configuration

Set in `apps/api/.env`:

- **`VAPI_API_KEY`** — Private key from the Vapi dashboard. Used to **retrieve call/transcript by `call_id`** when the client commits without sending the full `transcript` body.
- **`VAPI_API_BASE_URL`** (optional) — Default `https://api.vapi.ai`.

No `VAPI_CALLBACK_BASE_URL` is required for this flow: there is no inbound “custom LLM” webhook on this service for voice.

## End-to-end flow

1. User opens Builder (`/builder`) and starts voice; the browser runs the Vapi Web SDK with the dashboard assistant.
2. User and assistant speak; transcript chunks can be accumulated in the client.
3. When the call ends, the client calls **`POST /builder/transcript/commit`** with `Authorization: Bearer <jwt>` and a JSON body such as:
   - `call_id`: Vapi call id (server fetches transcript if `VAPI_API_KEY` is set), and/or  
   - `transcript`: full text fallback assembled in the browser.  
   At least one must produce non-empty text.
4. The API runs **`commit_builder_transcript`** → **`_commit_extraction_input`**: `detect_experiences` then **`run_draft_single`** for each experience index, then finalizes committed cards (see `EXPERIENCE_CARD_FLOW.md`).

## API endpoint

### `POST /builder/transcript/commit`

- **Auth:** required (`get_current_user`).
- **Body:** `BuilderTranscriptCommitRequest` — `call_id`, `transcript`, `session_id`, `mode` (`"text"` \| `"voice"`).
- **Response:** `BuilderSessionCommitResponse` — `session_id`, `session_status`, `committed_card_ids`, `committed_card_count`, etc.

## Provider keys (cost)

In the Vapi dashboard under **Provider Keys**, you can add your own **ElevenLabs** (TTS) and **Deepgram** (STT) keys so usage is billed by those providers plus Vapi’s platform fee, instead of only Vapi’s bundled rates.

## Troubleshooting

**Transcript empty / commit returns zero cards:** Ensure either `transcript` in the request is non-empty or `call_id` is valid and **`VAPI_API_KEY`** is set so the server can fetch the call from Vapi.

**401 on commit:** JWT missing or expired; user must be logged in.

**502/503 from transcript fetch:** Vapi API unreachable or invalid `call_id`; fall back to passing `transcript` from the client.

**Legacy `/convai/*` routes:** Older docs referred to a custom LLM proxy and in-memory ConvAI session. That code path is not present in the current API; use the dashboard assistant + `/builder/transcript/commit` instead.
