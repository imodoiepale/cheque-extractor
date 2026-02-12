#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo ""
echo "  CheckPro - Setup"
echo "  ================"
echo ""

# ── Prerequisites ──────────────────────────────────────────
echo "  Checking prerequisites..."

fail=0

# Python
if command -v python3 &> /dev/null; then
    PY=python3
elif command -v python &> /dev/null; then
    PY=python
else
    echo "  [x] Python 3.9+ is required. Install from https://python.org"
    fail=1
fi
if [ $fail -eq 0 ]; then
    echo "  [ok] $($PY --version)"
fi

# Node.js
if ! command -v node &> /dev/null; then
    echo "  [x] Node.js 18+ is required. Install from https://nodejs.org"
    fail=1
else
    echo "  [ok] Node.js $(node -v)"
fi

# Tesseract
if ! command -v tesseract &> /dev/null; then
    echo "  [!] Tesseract OCR not found. Install:"
    echo "      macOS:  brew install tesseract"
    echo "      Ubuntu: sudo apt install tesseract-ocr"
    echo "      Windows: choco install tesseract"
else
    echo "  [ok] Tesseract $(tesseract --version 2>&1 | head -1)"
fi

# poppler (for pdf2image)
if ! command -v pdftoppm &> /dev/null; then
    echo "  [!] poppler-utils not found (needed for PDF rendering). Install:"
    echo "      macOS:  brew install poppler"
    echo "      Ubuntu: sudo apt install poppler-utils"
    echo "      Windows: choco install poppler"
else
    echo "  [ok] poppler (pdftoppm found)"
fi

if [ $fail -ne 0 ]; then
    echo ""
    echo "  Fix the issues above and re-run this script."
    exit 1
fi

# ── Environment files ──────────────────────────────────────
echo ""
echo "  Setting up environment files..."

if [ ! -f .env ]; then
    cp .env.example .env
    echo "  [ok] Created .env from .env.example"
else
    echo "  [ok] .env exists"
fi

if [ ! -f frontend/.env.local ]; then
    cat > frontend/.env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_BACKEND_URL=http://localhost:3090
EOF
    echo "  [ok] Created frontend/.env.local"
else
    echo "  [ok] frontend/.env.local exists"
fi

# ── Backend (Python) ──────────────────────────────────────
echo ""
echo "  Installing backend dependencies..."

cd backend
$PY -m pip install --quiet -r requirements.txt
cd "$ROOT_DIR"
echo "  [ok] Python packages installed"

# ── Frontend (Next.js) ────────────────────────────────────
echo ""
echo "  Installing frontend dependencies..."

cd frontend
npm install --silent
cd "$ROOT_DIR"
echo "  [ok] Node modules installed"

# ── Done ──────────────────────────────────────────────────
echo ""
echo "  Setup complete!"
echo ""
echo "  Next steps:"
echo "  1. Edit .env with your Supabase + Gemini credentials"
echo "  2. Edit frontend/.env.local with your Supabase URL + anon key"
echo "  3. Run the Supabase migration SQL in your Supabase dashboard"
echo "     (see supabase/migrations/)"
echo "  4. Start the app:"
echo "       Backend:  cd backend && python api_server.py"
echo "       Frontend: cd frontend && npm run dev"
echo ""
echo "  Or use Docker:"
echo "       cd docker && docker compose up --build"
echo ""