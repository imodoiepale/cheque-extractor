# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This App Does

**Kyriq** is a SaaS app that extracts data from scanned cheque PDFs using triple-engine OCR (Tesseract + NuMarkdown + Gemini), then reconciles those checks against QuickBooks Online transactions. It also ships a Chrome extension (`chrome-extension/`) that injects into QuickBooks pages and clears matched transactions directly.

---

## Development Commands

### Run Both Services
```bash
npm run dev           # Starts frontend (port 3080) + backend (port 3090) concurrently
```

### Frontend Only (Next.js)
```bash
cd frontend
npm run dev           # http://localhost:3080
npm run build
npm run lint
npm run type-check    # tsc --noEmit, no emit
```

### Backend Only (Python FastAPI)
```bash
cd backend
pip install -r requirements.txt
uvicorn api_server:app --host 0.0.0.0 --port 3090 --reload
```

### Docker (full stack)
```bash
docker-compose -f docker/docker-compose.yml up
```

### Database Migrations
Migrations are in `supabase/migrations/` (numbered 001–023). Apply via Supabase CLI or the Supabase dashboard. No automated migration runner exists in the repo.

---

## Architecture

### Three-Service Structure

```
frontend/   →  Next.js 16 app (port 3080)
backend/    →  Python FastAPI (port 3090)
chrome-extension/  →  Manifest V3 extension (targets *.intuit.com)
```

The frontend **proxies all backend calls** through `frontend/pages/api/`. Direct browser-to-backend calls don't happen. This proxy layer also handles Supabase auth validation before forwarding.

### Processing Pipeline

1. `POST /api/upload-analyze` — PDF → Poppler → OpenCV detects check boundaries → returns `job_id`
2. `POST /api/start-extraction` — spawns `ThreadPoolExecutor(max_workers=3)` running Tesseract, NuMarkdown (HuggingFace), and Gemini Flash in parallel
3. Results written to `backend/output/{job_id}/` as JSON files per check per engine
4. `GET /api/jobs/{id}` — polling endpoint; frontend polls until `status === 'complete'`
5. `hybrid.json` per check = merged best-field result with confidence scores
6. User reviews/edits in `/review`, then exports to CSV/IIF/QBO/Xero/Zoho/Sage

### QuickBooks Integration

**Two separate QB token stores exist** (legacy + multi-company):
- `integrations` table — single-company legacy store
- `qb_connections` table — multi-company source of truth (preferred)

`pull-checks.ts` always reads `qb_connections` first and falls back to `integrations`. Token refreshes update **both** tables to stay in sync.

QBO entities pulled for cheque reconciliation:
- `Purchase WHERE PaymentType='Check'` — cheques written to vendors
- `BillPayment` (filtered client-side for `PayType=Check`) — bills paid by cheque
- `Check` — payroll/direct disbursements
- `Payment` (filtered client-side for cheque payment method) — received cheques
- `Deposit` — bank deposits

`BankTransaction` is **not** a queryable IDS entity; QB returns `QueryValidationError` for it.

QBO queries use `minorversion=73` and paginate at 1000 records per page via `qboQueryAll()`.

### Chrome Extension

- Manifest V3, service worker at `background/service-worker.js`
- Content script (`content/qbo-overlay.js`) injects into `*.intuit.com` pages
- Side panel UI at `sidepanel/sidepanel.html`
- Communicates with the Kyriq backend (Railway) and Supabase directly
- Auth via `chrome.identity` API storing tokens in `chrome.storage`

### Database (Supabase PostgreSQL)

Multi-tenant: every row carries `tenant_id`. Row-Level Security (RLS) policies enforce tenant isolation — the service role key bypasses RLS for backend writes.

Key tables:
- `check_jobs` / `checks` — extraction results
- `qb_connections` — multi-company OAuth tokens (preferred over `integrations`)
- `integrations` — legacy single-company QB tokens + per-tenant QB credentials
- `qb_transactions` — synced QB data for the match engine (upserted on conflict `tenant_id,realm_id,txn_id`)
- `qb_entries` — QB data for the comparison page (cleared + reinserted on each sync)
- `matches` — check-to-transaction match results with scores

### State Management (Frontend)

- **Zustand** — global app state (stores in `frontend/lib/store/`)
- **TanStack React Query** — server state, caching
- **SWR** — used in some polling patterns for job status

### Path Aliases

`@/*` maps to `frontend/` root (configured in `tsconfig.json`). Use `@/lib/...`, `@/components/...` etc.

---

## Key Files

| File | Purpose |
|------|---------|
| `backend/check_extractor.py` | Core OCR engine — OpenCV detection + parallel OCR + hybrid merge |
| `backend/api_server.py` | FastAPI server — all REST endpoints |
| `frontend/pages/api/qbo/pull-checks.ts` | Pulls all cheque-related transactions from QBO |
| `frontend/lib/matching-algorithm.ts` | Scoring logic for check↔transaction matching |
| `frontend/lib/supabase/api.ts` | `createAuthenticatedClient()` used in all API routes |
| `supabase/migrations/001_schema.sql` | Canonical schema definition |
| `chrome-extension/background/service-worker.js` | Extension service worker (QB OAuth + API calls) |
| `chrome-extension/sidepanel/sidepanel.js` | Side panel UI logic |

---

## Environment Variables

Copy from `.env` for local dev. Key variables:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET   # Intuit OAuth
GEMINI_API_KEYS                                    # Comma-separated, rotated round-robin
OPENAI_API_KEY                                     # Fallback OCR
BACKEND_URL                                        # e.g. http://localhost:3090
```

`REQUIRE_AUTH=true` on the backend enables JWT verification for all `/api/*` routes.

---

## Production Deployment

- **Frontend**: Vercel (`https://kyriq.com`)
- **Backend**: Railway (`https://check-extractor-production-2026.up.railway.app`)
- **Database**: Supabase hosted PostgreSQL
- Docker Compose available for self-hosted deployments (`docker/docker-compose.yml`)
