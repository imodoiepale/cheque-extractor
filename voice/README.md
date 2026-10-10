# Kyriq Voice (beta)

A conversational agent over a firm's own reconciliation data. Ask "which checks
need attention?" or "read me check 1042"; it calls read-only tools and answers
in speech.

- `app.py`: FastAPI service, `POST /chat` and `GET /health`.
- `selfcheck.py`: no-network check of the tool layer (`python voice/selfcheck.py`).
- `../docker/Dockerfile.voice`: container for Railway or any VPS.
- UI: `frontend/app/(app)/voice/page.tsx`. Proxy: `frontend/pages/api/voice/chat.ts`.

## How it stays safe

Every Supabase read uses the caller's own access token with the anon key, so
row-level security limits the agent to the caller's firm. The tools only read;
the agent cannot approve, clear or edit anything. The Next.js proxy checks the
session before forwarding.

## Environment

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | session check and data |
| `OPENAI_API_KEY` | the agent (model `VOICE_MODEL`, default `gpt-4.1-mini`) |
| `FISH_AUDIO_API_KEY`, `FISH_VOICE_ID` | spoken replies; without them the browser voice is used |
| `VOICE_URL` (on the frontend) | where the proxy finds this service |

## Run

    cd voice && uvicorn app:app --port 3095

## Next

Persistent per-tenant memory (entities, payees, past issues) in Supabase
tables with RLS, a `generate_report` tool (deterministic SQL to CSV/PDF in
Storage), and whole-books tools over `qb_transactions`.
