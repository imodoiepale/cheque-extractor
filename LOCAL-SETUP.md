# 🏠 Local Development Setup

## 📋 Prerequisites

Before starting, ensure you have these installed:

### 1. **Python 3.9+**
```bash
python --version
# Should show: Python 3.9.x or higher
```

**Install:** https://www.python.org/downloads/

### 2. **Node.js 18+**
```bash
node --version
# Should show: v18.x.x or higher
```

**Install:** https://nodejs.org/

### 3. **Tesseract OCR**
```bash
tesseract --version
# Should show: tesseract 4.x.x or higher
```

**Install:**
- **Windows:** `choco install tesseract` or download from https://github.com/UB-Mannheim/tesseract/wiki
- **macOS:** `brew install tesseract`
- **Linux:** `sudo apt install tesseract-ocr`

### 4. **Poppler (for PDF processing)**
```bash
pdftoppm -v
# Should show version info
```

**Install:**
- **Windows:** `choco install poppler` or download from https://github.com/oschwartz10612/poppler-windows/releases
- **macOS:** `brew install poppler`
- **Linux:** `sudo apt install poppler-utils`

---

## 🔧 Step-by-Step Setup

### **Step 1: Create Environment Files**

#### Backend Environment (`.env` in root)
Create `c:/Users/inkno/Documents/GitHub/cheque-extractor/.env`:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Google Gemini API (optional - can set via UI later)
GEMINI_API_KEY=your_gemini_api_key

# QuickBooks OAuth (optional - for later)
INTUIT_CLIENT_ID=
INTUIT_CLIENT_SECRET=
INTUIT_REDIRECT_URI=http://localhost:3080/api/qbo/callback
FRONTEND_URL=http://localhost:3080

# Server
PORT=3090
```

#### Frontend Environment (`frontend/.env.local`)
Create `c:/Users/inkno/Documents/GitHub/cheque-extractor/frontend/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_API_URL=http://localhost:3090
```

---

### **Step 2: Install Dependencies**

#### Backend (Python)
```powershell
cd backend
pip install -r requirements.txt
```

**Packages installed:**
- FastAPI (web framework)
- Uvicorn (ASGI server)
- pytesseract (OCR)
- opencv-python (image processing)
- pdf2image (PDF handling)
- And more...

#### Frontend (Next.js)
```powershell
cd frontend
npm install
```

**Packages installed:**
- Next.js 16
- React 18
- Supabase client
- Tailwind CSS
- And more...

---

### **Step 3: Run Database Migration**

1. Go to your **Supabase Dashboard**: https://app.supabase.com
2. Select your project
3. Go to **SQL Editor**
4. Click **New Query**
5. Copy and paste the contents of `supabase-migrations.sql`
6. Click **Run**

This creates:
- ✅ `app_settings` table (API keys, OAuth tokens)
- ✅ `quickbooks_entries` table (QB comparison data)
- ✅ `check_jobs` table (extraction jobs)
- ✅ All indexes and RLS policies

---

### **Step 4: Start the Servers**

#### Option A: Using Two Terminals (Recommended)

**Terminal 1 - Backend:**
```powershell
cd backend
python api_server.py
```

You should see:
```
============================================================
  Check Extractor API Server
  http://localhost:3090
  Docs: http://localhost:3090/docs
============================================================

✓ Supabase configured: https://xxxxx.supabase.co...
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:3090
```

**Terminal 2 - Frontend:**
```powershell
cd frontend
npm run dev
```

You should see:
```
▲ Next.js 16.1.6 (Turbopack)
- Local:         http://localhost:3080
- Network:       http://192.168.1.x:3080

✓ Starting...
✓ Ready in 3.7s
```

#### Option B: Using npm (from root)

The root `package.json` has a script to run both:

```powershell
npm run dev
```

This runs both backend and frontend concurrently.

---

## ✅ Verify Everything Works

### 1. **Check Backend Health**
Open: http://localhost:3090/api/health

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-20T11:30:00.000000"
}
```

### 2. **Check Backend API Docs**
Open: http://localhost:3090/docs

You should see the FastAPI Swagger documentation with all endpoints.

### 3. **Check Frontend**
Open: http://localhost:3080

You should see the application homepage.

### 4. **Test Settings Page**
Navigate to: http://localhost:3080/settings/integrations

You should see:
- Google Gemini API key input
- QuickBooks connection status
- Webhook configuration

---

## 🎯 Quick Test Workflow

### 1. **Configure API Key (Optional)**
1. Go to http://localhost:3080/settings/integrations
2. Enter your Google Gemini API key
3. Click "Save API Keys"

### 2. **Upload a Test Cheque**
1. Go to http://localhost:3080/upload
2. Upload a PDF with cheques
3. Watch the processing in real-time

### 3. **View Results**
1. Go to http://localhost:3080/dashboard
2. See extracted cheque data
3. Review accuracy

### 4. **Test QB Comparisons**
1. Go to http://localhost:3080/qb-comparisons
2. Click "Upload QB Data"
3. Upload a QuickBooks CSV/IIF file
4. See intelligent matching

---

## 🐛 Troubleshooting

### **Port 3080 already in use**
```powershell
# Find process using port 3080
netstat -ano | findstr :3080

# Kill the process (replace PID)
taskkill /PID <PID> /F
```

### **Port 3090 already in use**
```powershell
# Find process using port 3090
netstat -ano | findstr :3090

# Kill the process (replace PID)
taskkill /PID <PID> /F
```

### **Tesseract not found**
```
Error: pytesseract.pytesseract.TesseractNotFoundError
```

**Solution:**
1. Install Tesseract OCR
2. Add to PATH: `C:\Program Files\Tesseract-OCR`
3. Restart terminal

### **Poppler not found**
```
Error: Unable to get page count. Is poppler installed?
```

**Solution:**
1. Install Poppler
2. Add to PATH: `C:\Program Files\poppler\bin`
3. Restart terminal

### **Supabase connection error**
```
⚠ Supabase not configured – results will NOT be saved to DB
```

**Solution:**
1. Check `.env` file has correct Supabase URL and key
2. Verify Supabase project is active
3. Run database migration
4. Restart backend server

### **Module not found errors**
```
ModuleNotFoundError: No module named 'fastapi'
```

**Solution:**
```powershell
cd backend
pip install -r requirements.txt
```

### **Frontend build errors**
```
Error: Cannot find module 'next'
```

**Solution:**
```powershell
cd frontend
npm install
```

---

## 📁 Project Structure

```
cheque-extractor/
├── backend/
│   ├── api_server.py          # FastAPI server
│   ├── check_extractor.py     # Core extraction logic
│   ├── requirements.txt       # Python dependencies
│   └── uploads/               # Uploaded PDFs (auto-created)
├── frontend/
│   ├── app/                   # Next.js app directory
│   │   ├── (app)/            # Main app routes
│   │   │   ├── upload/       # Upload page
│   │   │   ├── dashboard/    # Documents page
│   │   │   ├── qb-comparisons/ # QB Comparisons page
│   │   │   └── settings/     # Settings page
│   ├── components/           # React components
│   ├── lib/                  # Utilities
│   └── package.json          # Node dependencies
├── .env                      # Backend environment
├── frontend/.env.local       # Frontend environment
└── supabase-migrations.sql   # Database schema
```

---

## 🔐 Environment Variables Reference

### Backend (`.env`)
| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Yes | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Yes | Supabase service role key (secret) |
| `GEMINI_API_KEY` | ⚠️ Optional | Google Gemini API key (can set via UI) |
| `INTUIT_CLIENT_ID` | ⚠️ Optional | QuickBooks OAuth client ID |
| `INTUIT_CLIENT_SECRET` | ⚠️ Optional | QuickBooks OAuth client secret |
| `INTUIT_REDIRECT_URI` | ⚠️ Optional | OAuth callback URL |
| `FRONTEND_URL` | ⚠️ Optional | Frontend URL for redirects |
| `PORT` | ⚠️ Optional | Backend port (default: 3090) |

### Frontend (`frontend/.env.local`)
| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ Yes | Supabase anon/public key |
| `NEXT_PUBLIC_API_URL` | ✅ Yes | Backend API URL (http://localhost:3090) |

---

## 🎉 You're Ready!

Once everything is running:

1. ✅ Backend: http://localhost:3090
2. ✅ Frontend: http://localhost:3080
3. ✅ API Docs: http://localhost:3090/docs
4. ✅ Settings: http://localhost:3080/settings/integrations
5. ✅ QB Comparisons: http://localhost:3080/qb-comparisons

**Start uploading and processing cheques!** 🚀

---

## 📚 Next Steps

After local testing works:
1. Deploy to Railway (see `DEPLOYMENT-GUIDE.md`)
2. Configure QuickBooks OAuth (see `INTUIT-URLS-REFERENCE.md`)
3. Set up production environment variables
4. Test OAuth flow in production

---

**Need help?** Check the troubleshooting section or review the error logs in your terminal.
