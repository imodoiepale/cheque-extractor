# CheckPro - Windows Setup Script
# Run: powershell -ExecutionPolicy Bypass -File scripts\setup.ps1

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $ROOT

Write-Host ""
Write-Host "  CheckPro - Setup" -ForegroundColor Cyan
Write-Host "  ================" -ForegroundColor Cyan
Write-Host ""

# ── Prerequisites ──────────────────────────────────────────
Write-Host "  Checking prerequisites..." -ForegroundColor White

$fail = $false

# Python
$py = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
    $py = "python"
    $ver = & python --version 2>&1
    Write-Host "  [ok] $ver" -ForegroundColor Green
} elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
    $py = "python3"
    $ver = & python3 --version 2>&1
    Write-Host "  [ok] $ver" -ForegroundColor Green
} else {
    Write-Host "  [x] Python 3.9+ required. Install from https://python.org" -ForegroundColor Red
    $fail = $true
}

# Node.js
if (Get-Command node -ErrorAction SilentlyContinue) {
    $ver = & node -v 2>&1
    Write-Host "  [ok] Node.js $ver" -ForegroundColor Green
} else {
    Write-Host "  [x] Node.js 18+ required. Install from https://nodejs.org" -ForegroundColor Red
    $fail = $true
}

# Tesseract
if (Get-Command tesseract -ErrorAction SilentlyContinue) {
    Write-Host "  [ok] Tesseract OCR found" -ForegroundColor Green
} else {
    Write-Host "  [!] Tesseract OCR not found. Install: choco install tesseract" -ForegroundColor Yellow
}

# poppler
if (Get-Command pdftoppm -ErrorAction SilentlyContinue) {
    Write-Host "  [ok] poppler found" -ForegroundColor Green
} else {
    Write-Host "  [!] poppler not found (PDF rendering). Install: choco install poppler" -ForegroundColor Yellow
}

if ($fail) {
    Write-Host ""
    Write-Host "  Fix the issues above and re-run." -ForegroundColor Red
    exit 1
}

# ── Environment files ──────────────────────────────────────
Write-Host ""
Write-Host "  Setting up environment files..." -ForegroundColor White

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "  [ok] Created .env from .env.example" -ForegroundColor Green
} else {
    Write-Host "  [ok] .env exists" -ForegroundColor Green
}

if (-not (Test-Path "frontend\.env.local")) {
    @"
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_BACKEND_URL=http://localhost:3090
"@ | Set-Content "frontend\.env.local"
    Write-Host "  [ok] Created frontend\.env.local" -ForegroundColor Green
} else {
    Write-Host "  [ok] frontend\.env.local exists" -ForegroundColor Green
}

# ── Backend (Python) ──────────────────────────────────────
Write-Host ""
Write-Host "  Installing backend dependencies..." -ForegroundColor White

Push-Location backend
& $py -m pip install -q -r requirements.txt
Pop-Location
Write-Host "  [ok] Python packages installed" -ForegroundColor Green

# ── Frontend (Next.js) ────────────────────────────────────
Write-Host ""
Write-Host "  Installing frontend dependencies..." -ForegroundColor White

Push-Location frontend
& npm install --silent 2>$null
Pop-Location
Write-Host "  [ok] Node modules installed" -ForegroundColor Green

# ── Done ──────────────────────────────────────────────────
Write-Host ""
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Cyan
Write-Host "  1. Edit .env with your Supabase + Gemini credentials"
Write-Host "  2. Edit frontend\.env.local with your Supabase URL + anon key"
Write-Host "  3. Run the Supabase migration SQL in your Supabase dashboard"
Write-Host "     (see supabase\migrations\)"
Write-Host "  4. Start the app:"
Write-Host "       Backend:  cd backend; python api_server.py" -ForegroundColor Gray
Write-Host "       Frontend: cd frontend; npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "  Or use Docker:" -ForegroundColor Cyan
Write-Host "       cd docker; docker compose up --build" -ForegroundColor Gray
Write-Host ""
