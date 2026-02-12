# Check Extractor

Automated check processing system that extracts data from scanned check PDFs using **OpenCV detection**, **triple OCR** (Tesseract + NuMarkdown + Gemini Flash), and **hybrid field merging**.

## Features

- **Smart PDF Detection**: Auto-detects check layout format (bordered contours vs line-grid) and applies the predominant style across all pages
- **Triple OCR Engine**: Tesseract, NuMarkdown (HuggingFace), and Google Gemini 2.5 Flash run in parallel
- **Hybrid Merge**: Cross-validates all 3 engines, picks the best value per field with confidence scoring
- **Multi-format Support**: Handles bordered checks (bank statements) and line-grid layouts (Chase-style reports)
- **Web UI**: Upload PDFs, watch real-time processing, review extracted data
- **Supabase Integration**: Auth, database storage, audit logs

## Architecture

```
Frontend (Next.js, port 3080)
  ├── /upload        → Upload PDF
  ├── /process/[id]  → Live processing status
  ├── /dashboard     → View all checks
  ├── /review/[id]   → Review & edit extracted data
  └── /export        → Export to CSV/QBO
        │
        ▼  (Next.js API routes proxy to Python)
Python API (FastAPI, port 3090)
  ├── POST /api/upload-pdf     → Detect + crop + OCR
  ├── GET  /api/jobs/{id}      → Poll job status
  ├── GET  /api/checks/{j}/{c}/image → Cropped check image
  └── Saves results → Supabase DB
        │
        ▼
Supabase (PostgreSQL + Auth + Storage)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14, React, TailwindCSS, Lucide icons |
| **Backend** | Python 3.10+, FastAPI, OpenCV, Tesseract, Gemini API |
| **Database** | Supabase (PostgreSQL + Auth + Storage) |
| **Detection** | OpenCV contour detection + line-grid analysis |
| **OCR** | Tesseract, NuMarkdown (HuggingFace), Google Gemini 2.5 Flash |

## Prerequisites

- **Python 3.10+** with pip
- **Node.js 18+** with npm
- **Tesseract OCR** installed ([Windows](https://github.com/UB-Mannheim/tesseract/wiki), [Mac](https://formulae.brew.sh/formula/tesseract), [Linux](https://tesseract-ocr.github.io/tessdoc/Installation.html))
- **Poppler** (for PDF→image conversion) — included in `testing/poppler/` for Windows
- **Supabase** project (free tier works)
- **Google Gemini API key** (free tier: 15 RPM)

## Quick Start

### 1. Clone & Setup Environment

```bash
git clone https://github.com/imodoiepale/cheque-extractor.git
cd cheque-extractor
cp .env.example .env
# Edit .env with your Supabase and Gemini keys
```

### 2. Install Python Backend

```bash
cd testing
pip install -r requirements.txt
```

### 3. Install Frontend

```bash
cd frontend
npm install
```

### 4. Run Both Servers

**Terminal 1 — Python API (port 3090):**
```bash
cd testing
python api_server.py
```

**Terminal 2 — Next.js Frontend (port 3080):**
```bash
cd frontend
npm run dev
```

### 5. Open the App

Visit **http://localhost:3080** → Login → Upload a PDF → Watch it process!

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (for backend DB writes) |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `NEXT_PUBLIC_BACKEND_URL` | No | Python API URL (default: `http://localhost:3090`) |

## API Reference

The Python backend exposes these endpoints (also available at `/docs` when running):

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload-pdf` | Upload PDF, starts detection + OCR |
| `GET` | `/api/jobs/{id}` | Poll job status (pending/detecting/extracting/ocr/complete) |
| `GET` | `/api/jobs` | List all jobs |
| `GET` | `/api/checks/{job}/{check}/image` | Get cropped check image |
| `GET` | `/api/checks/{job}/{check}/ocr/{engine}` | Get OCR result (tesseract/gemini/hybrid) |
| `GET` | `/api/checks/{job}/summary` | Get full extraction summary |
| `DELETE` | `/api/jobs/{id}` | Delete job and files |

## Deployment

### Docker

```bash
cd docker
docker-compose up -d
```

### Manual (VPS)

1. Install Python 3.10+, Node 18+, Tesseract, Poppler
2. Clone repo, set `.env`
3. `cd testing && pip install -r requirements.txt`
4. `cd frontend && npm install && npm run build`
5. Run with PM2 or systemd:
   ```bash
   # Backend
   cd testing && python api_server.py &
   # Frontend
   cd frontend && npm start &
   ```

### Vercel + Railway

- **Frontend** → Deploy `frontend/` to Vercel
- **Backend** → Deploy `testing/` to Railway (Python runtime)
- Set `NEXT_PUBLIC_BACKEND_URL` to Railway URL

## Project Structure

```
cheque-extractor/
├── frontend/           # Next.js web app (port 3080)
│   ├── app/            # App router pages
│   ├── components/     # React components
│   ├── lib/            # Hooks, utils, Supabase client
│   └── pages/api/      # API routes (proxy to Python)
├── testing/            # Python backend
│   ├── api_server.py   # FastAPI server (port 3090)
│   ├── check_extractor.py  # Core detection + OCR engine
│   ├── requirements.txt
│   └── poppler/        # PDF converter (Windows)
├── backend/            # Node.js backend (legacy, kept for QBO export)
├── supabase/           # Database migrations
├── docker/             # Docker compose config
└── .env.example        # Environment template
```

## License

MIT