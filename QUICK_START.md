# 🚀 Quick Start Guide

## Get Running in 5 Minutes

### 1. Install Dependencies (2 min)
```bash
# Frontend
cd frontend
npm install

# Backend
cd ../backend
npm install
```

### 2. Create Environment Files (1 min)

**Frontend: `frontend/.env.local`**
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_BACKEND_URL=http://localhost:3090
```

**Backend: `backend/.env`**
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
VISION_API_KEY=your-gemini-api-key
PORT=3090
NODE_ENV=development
CORS_ORIGIN=http://localhost:3080
```

### 3. Run Database Migrations (1 min)
```bash
supabase link --project-ref your-project-ref
supabase db push
```

### 4. Start the Application (1 min)
```bash
# Terminal 1 - Backend (Port 3090)
cd backend
npm run dev

# Terminal 2 - Frontend (Port 3080)
cd frontend
npm run dev
```

### 5. Access & Configure
- Open: http://localhost:3080
- Sign up for an account
- Go to Settings → Integrations
- Add your Google Gemini API key

**Done! 🎉**

---

## 📝 What You Need

### Required
- ✅ Supabase account (free tier)
- ✅ Google Gemini API key ([Get here](https://makersuite.google.com/app/apikey))
- ✅ Tesseract OCR installed

### Optional
- QuickBooks Developer account (for export feature)

---

## 🔧 Ports

- **Frontend:** http://localhost:3080
- **Backend:** http://localhost:3090

---

## ⚠️ Troubleshooting

**TypeScript errors?**
→ Run `npm install` in both directories

**Port already in use?**
```bash
npx kill-port 3080
npx kill-port 3090
```

**Tesseract not found?**
```bash
# Windows (Chocolatey)
choco install tesseract

# macOS
brew install tesseract

# Linux
sudo apt-get install tesseract-ocr
```

---

For detailed setup instructions, see **[SETUP_GUIDE.md](./SETUP_GUIDE.md)**
