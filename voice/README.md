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
| `FISH_MODEL` | Fish voice model, default `s2.1-pro` (or `s2-pro`, `s2.1-pro-free`) |
| `VOICE_URL` (on the frontend) | where the proxy finds this service |

## Run

    cd voice && uvicorn app:app --port 3095

## What it can do

- **Look up**: find checks by payee, number, amount and date ranges, status; summarize matches; list issues.
- **Show**: put a check on screen (image, extracted fields with confidence, match score); step through lists with next/previous.
- **Propose**: approve one match, approve all exact matches, flag with a reason. The screen shows a confirmation card; only the user's click calls `/api/matches/...` under their own session and role.
- **Report**: build a branded PDF (jsPDF, `frontend/lib/voice/report-pdf.ts`), download it, or email it to the signed-in user (`/api/voice/email-report`).

The conversation design is `SCRIPT.md`, loaded as the system prompt.

## Next

Persistent per-tenant memory (entities, payees, past issues) in Supabase
tables with RLS, a `generate_report` tool (deterministic SQL to CSV/PDF in
Storage), and whole-books tools over `qb_transactions`.
