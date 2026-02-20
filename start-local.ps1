# Quick Start Script for Local Development
# Run this with: powershell -ExecutionPolicy Bypass -File start-local.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  🚀 Cheque Extractor - Local Development" -ForegroundColor Cyan
Write-Host "  =======================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "backend\api_server.py")) {
    Write-Host "  ❌ Error: Please run this script from the project root directory" -ForegroundColor Red
    exit 1
}

# Check prerequisites
Write-Host "  📋 Checking prerequisites..." -ForegroundColor Yellow
Write-Host ""

$allGood = $true

# Check Python
try {
    $pythonVersion = python --version 2>&1
    Write-Host "  ✅ Python: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Python not found. Install from https://python.org" -ForegroundColor Red
    $allGood = $false
}

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "  ✅ Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Node.js not found. Install from https://nodejs.org" -ForegroundColor Red
    $allGood = $false
}

# Check Tesseract
try {
    $tesseractVersion = tesseract --version 2>&1 | Select-Object -First 1
    Write-Host "  ✅ Tesseract: $tesseractVersion" -ForegroundColor Green
} catch {
    Write-Host "  ⚠️  Tesseract not found. Install: choco install tesseract" -ForegroundColor Yellow
    Write-Host "     OCR will not work without Tesseract!" -ForegroundColor Yellow
}

# Check Poppler
try {
    $popplerVersion = pdftoppm -v 2>&1 | Select-Object -First 1
    Write-Host "  ✅ Poppler: Found" -ForegroundColor Green
} catch {
    Write-Host "  ⚠️  Poppler not found. Install: choco install poppler" -ForegroundColor Yellow
    Write-Host "     PDF processing will not work without Poppler!" -ForegroundColor Yellow
}

if (-not $allGood) {
    Write-Host ""
    Write-Host "  ❌ Please install missing prerequisites and try again." -ForegroundColor Red
    exit 1
}

Write-Host ""

# Check environment files
Write-Host "  🔧 Checking environment files..." -ForegroundColor Yellow
Write-Host ""

if (-not (Test-Path ".env")) {
    Write-Host "  ⚠️  .env file not found!" -ForegroundColor Yellow
    Write-Host "     Creating template .env file..." -ForegroundColor Yellow
    
    @"
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Google Gemini API (optional - can set via UI later)
GEMINI_API_KEY=

# QuickBooks OAuth (optional)
INTUIT_CLIENT_ID=
INTUIT_CLIENT_SECRET=
INTUIT_REDIRECT_URI=http://localhost:3080/api/qbo/callback
FRONTEND_URL=http://localhost:3080

# Server
PORT=3090
"@ | Out-File -FilePath ".env" -Encoding UTF8
    
    Write-Host "  ✅ Created .env template" -ForegroundColor Green
    Write-Host "     ⚠️  IMPORTANT: Edit .env with your Supabase credentials!" -ForegroundColor Yellow
} else {
    Write-Host "  ✅ .env exists" -ForegroundColor Green
}

if (-not (Test-Path "frontend\.env.local")) {
    Write-Host "  ⚠️  frontend\.env.local not found!" -ForegroundColor Yellow
    Write-Host "     Creating template frontend\.env.local..." -ForegroundColor Yellow
    
    @"
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_API_URL=http://localhost:3090
"@ | Out-File -FilePath "frontend\.env.local" -Encoding UTF8
    
    Write-Host "  ✅ Created frontend\.env.local template" -ForegroundColor Green
    Write-Host "     ⚠️  IMPORTANT: Edit frontend\.env.local with your Supabase credentials!" -ForegroundColor Yellow
} else {
    Write-Host "  ✅ frontend\.env.local exists" -ForegroundColor Green
}

Write-Host ""

# Check if dependencies are installed
Write-Host "  📦 Checking dependencies..." -ForegroundColor Yellow
Write-Host ""

$needsBackendInstall = $false
$needsFrontendInstall = $false

if (-not (Test-Path "backend\venv") -and -not (python -c "import fastapi" 2>$null)) {
    Write-Host "  ⚠️  Backend dependencies not installed" -ForegroundColor Yellow
    $needsBackendInstall = $true
}

if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "  ⚠️  Frontend dependencies not installed" -ForegroundColor Yellow
    $needsFrontendInstall = $true
}

if ($needsBackendInstall -or $needsFrontendInstall) {
    Write-Host ""
    $install = Read-Host "  Install dependencies now? (y/n)"
    
    if ($install -eq "y" -or $install -eq "Y") {
        if ($needsBackendInstall) {
            Write-Host ""
            Write-Host "  📦 Installing backend dependencies..." -ForegroundColor Yellow
            Set-Location backend
            python -m pip install -r requirements.txt
            Set-Location ..
            Write-Host "  ✅ Backend dependencies installed" -ForegroundColor Green
        }
        
        if ($needsFrontendInstall) {
            Write-Host ""
            Write-Host "  📦 Installing frontend dependencies..." -ForegroundColor Yellow
            Set-Location frontend
            npm install
            Set-Location ..
            Write-Host "  ✅ Frontend dependencies installed" -ForegroundColor Green
        }
    } else {
        Write-Host ""
        Write-Host "  ⚠️  Skipping dependency installation" -ForegroundColor Yellow
        Write-Host "     Run manually:" -ForegroundColor Yellow
        Write-Host "       Backend:  cd backend && pip install -r requirements.txt" -ForegroundColor Yellow
        Write-Host "       Frontend: cd frontend && npm install" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "  ✅ Ready to start!" -ForegroundColor Green
Write-Host ""
Write-Host "  Starting servers..." -ForegroundColor Cyan
Write-Host "  - Backend:  http://localhost:3090" -ForegroundColor Cyan
Write-Host "  - Frontend: http://localhost:3080" -ForegroundColor Cyan
Write-Host "  - API Docs: http://localhost:3090/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Press Ctrl+C to stop both servers" -ForegroundColor Yellow
Write-Host ""

# Start backend in background
$backendJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    Set-Location backend
    python api_server.py
}

# Wait a bit for backend to start
Start-Sleep -Seconds 3

# Start frontend in background
$frontendJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    Set-Location frontend
    npm run dev
}

# Monitor jobs
try {
    Write-Host "  🚀 Servers starting..." -ForegroundColor Green
    Write-Host ""
    
    # Show initial output
    Start-Sleep -Seconds 5
    
    Write-Host "  Backend Output:" -ForegroundColor Cyan
    Receive-Job -Job $backendJob
    Write-Host ""
    
    Write-Host "  Frontend Output:" -ForegroundColor Cyan
    Receive-Job -Job $frontendJob
    Write-Host ""
    
    Write-Host "  ✅ Servers running!" -ForegroundColor Green
    Write-Host "  Open http://localhost:3080 in your browser" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Press Ctrl+C to stop..." -ForegroundColor Yellow
    
    # Keep showing output
    while ($true) {
        Start-Sleep -Seconds 2
        
        $backendOutput = Receive-Job -Job $backendJob
        if ($backendOutput) {
            Write-Host $backendOutput
        }
        
        $frontendOutput = Receive-Job -Job $frontendJob
        if ($frontendOutput) {
            Write-Host $frontendOutput
        }
        
        # Check if jobs are still running
        if ($backendJob.State -ne "Running" -or $frontendJob.State -ne "Running") {
            Write-Host ""
            Write-Host "  ⚠️  One or more servers stopped" -ForegroundColor Yellow
            break
        }
    }
} finally {
    Write-Host ""
    Write-Host "  🛑 Stopping servers..." -ForegroundColor Yellow
    Stop-Job -Job $backendJob, $frontendJob
    Remove-Job -Job $backendJob, $frontendJob
    Write-Host "  ✅ Servers stopped" -ForegroundColor Green
}
