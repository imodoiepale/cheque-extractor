# CheckPro — Installation Guide

Complete setup instructions for deploying CheckPro on a client machine or server.

---

## Prerequisites

| Dependency | Version | Required | Install |
|------------|---------|----------|---------|
| Python | 3.9+ | Yes | [python.org](https://python.org) |
| Node.js | 18+ | Yes | [nodejs.org](https://nodejs.org) |
| Tesseract OCR | 5+ | Yes | See below |
| poppler | any | Yes | See below |
| Docker | 24+ | Optional | [docker.com](https://docker.com) |

### Install Tesseract & poppler

**macOS:**
```bash
brew install tesseract poppler
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install -y tesseract-ocr poppler-utils
```

**Windows (Chocolatey):**
```powershell
choco install tesseract poppler
```

**Windows (Manual):**
- Tesseract: Download from [UB-Mannheim](https://github.com/UB-Mannheim/tesseract/wiki) and add to PATH
- poppler: Download from [poppler releases](https://github.com/oschwartz10612/poppler-windows/releases) and add `bin/` to PATH

---

## Option A: Quick Setup (Development)

### 1. Clone & install

```bash
git clone <repo-url> cheque-extractor
cd cheque-extractor

# Linux/macOS
bash scripts/setup.sh

# Windows
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

### 2. Configure environment

Edit `.env` in the project root:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-api-key
```

Edit `frontend/.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_BACKEND_URL=http://localhost:3090
```

### 3. Set up Supabase database

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard) → SQL Editor
2. Run the migration files in order from `supabase/migrations/`:
   - `00000000000000_master_schema.sql` (if starting fresh)
   - Or run individual migrations in date order
3. Create a storage bucket called `checks` (public)

### 4. Start the app

**Terminal 1 — Backend:**
```bash
cd backend
python api_server.py
# Runs on http://localhost:3090
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
# Runs on http://localhost:3080
```

Open http://localhost:3080 in your browser.

---

## Option B: Docker Deployment (Production)

### 1. Configure environment

Create a `.env` file in the `docker/` directory:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-api-key
GEMINI_API_KEYS=key1,key2,key3
BACKEND_PORT=3090
FRONTEND_PORT=3080
```

### 2. Build & run

```bash
cd docker
docker compose up --build -d
```

This starts:
- **Backend** (Python/FastAPI) on port 3090
- **Frontend** (Next.js) on port 3080

### 3. Verify

```bash
# Check services are running
docker compose ps

# Check backend health
curl http://localhost:3090/api/health

# View logs
docker compose logs -f
```

### 4. Stop / restart

```bash
docker compose down        # Stop
docker compose up -d       # Start (no rebuild)
docker compose up --build  # Rebuild & start
```

---

## Supabase Setup

### Required tables

The app needs the `check_jobs` table. Run this SQL in Supabase SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS check_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID,
    user_id UUID,
    job_id TEXT UNIQUE NOT NULL,
    pdf_name TEXT NOT NULL,
    pdf_url TEXT,
    pdf_size BIGINT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','detecting','extracting','analyzed','ocr','ocr_running','complete','error')),
    doc_format TEXT,
    total_pages INTEGER DEFAULT 0,
    total_checks INTEGER DEFAULT 0,
    checks_data JSONB DEFAULT '[]'::jsonb,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now(),
    file_size BIGINT
);

CREATE INDEX IF NOT EXISTS idx_check_jobs_job_id ON check_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_check_jobs_status ON check_jobs(status);

ALTER TABLE check_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON check_jobs
    FOR ALL USING (true) WITH CHECK (true);
```

### Required storage bucket

1. Go to Supabase Dashboard → Storage
2. Create a new bucket called `checks`
3. Set it to **Public**
4. Add a policy allowing service role uploads

---

## API Keys

### Gemini API Key
1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create an API key
3. Add to `.env` as `GEMINI_API_KEY`
4. For multiple keys (rate limit rotation), use comma-separated: `GEMINI_API_KEYS=key1,key2,key3`

### Supabase Keys
1. Go to Supabase Dashboard → Settings → API
2. Copy **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
3. Copy **anon/public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Copy **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Frontend      │────▶│   Backend        │────▶│   Supabase   │
│   Next.js       │     │   Python/FastAPI  │     │   PostgreSQL │
│   Port 3080     │     │   Port 3090       │     │   + Storage  │
└─────────────────┘     └──────────────────┘     └──────────────┘
                              │
                        ┌─────┴─────┐
                        │ OCR       │
                        │ Tesseract │
                        │ NuMarkdown│
                        │ Gemini    │
                        └───────────┘
```

- **Frontend**: Next.js 14, React, TailwindCSS, Lucide icons
- **Backend**: Python FastAPI, OpenCV, Tesseract, Gemini Flash API
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **OCR Engines**: Tesseract (local), NuMarkdown (HuggingFace API), Gemini Flash (Google API)

---

## Hosting the Backend (Extraction Server)

The OCR extraction requires **Python + Tesseract + OpenCV** — these cannot run in Supabase Edge Functions (Deno/JS only). The backend must be hosted separately.

### Recommended hosting options

| Option | Best for | Notes |
|--------|----------|-------|
| **Docker on VPS** | Production | Use `docker compose up` on any Linux VPS (DigitalOcean, Hetzner, AWS EC2, etc.) |
| **Railway / Render** | Quick deploy | Push the repo, set env vars, done. Both support Docker. |
| **Fly.io** | Low latency | Deploy the backend Dockerfile globally. |
| **Local machine** | Development | `cd backend && python api_server.py` |

### What Supabase handles

Supabase is used for **database + storage + auth only**:
- **PostgreSQL**: Stores job metadata and extraction results (`check_jobs` table)
- **Storage**: Stores uploaded PDFs and cropped check images (bucket: `checks`)
- **Auth**: User signup/login (handled by frontend middleware)

### What the backend handles

The Python backend does all the heavy lifting:
- PDF page rendering (poppler/pdf2image)
- Check detection and cropping (OpenCV)
- OCR: Tesseract (local), NuMarkdown (HuggingFace API), Gemini Flash (Google API)
- Cross-validation and hybrid merge of OCR results
- Export to CSV/IIF/Xero/Zoho/Sage formats

### Production deployment example (VPS)

```bash
# On your VPS
git clone <repo-url> cheque-extractor
cd cheque-extractor/docker

# Create .env with your credentials
cp ../.env.example .env
nano .env

# Build and run
docker compose up --build -d

# Set up reverse proxy (nginx) to expose ports 3080/3090
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `EADDRINUSE` on port 3080/3090 | Kill existing process or change port in `.env` |
| Supabase insert errors | Check that `check_jobs` table exists and status constraint includes all values |
| Tesseract not found | Ensure `tesseract` is in PATH. Restart terminal after install. |
| PDF rendering fails | Ensure `poppler-utils` / `pdftoppm` is installed and in PATH |
| Images not loading after restart | Backend loads jobs from Supabase on startup; images fall back to Supabase Storage |
| Docker build fails on frontend | Ensure `output: 'standalone'` is in `next.config.js` |

---

## Updating

```bash
git pull
cd backend && pip install -r requirements.txt
cd ../frontend && npm install
# Restart both servers
```

Docker:
```bash
cd docker && docker compose up --build -d
```
