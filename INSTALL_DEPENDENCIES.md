# 🔧 Install Dependencies - Quick Fix

## Issue: `cross-env` not found

The error occurs because backend dependencies haven't been installed yet.

---

## ✅ **Solution: Install Backend Dependencies**

Run this command in PowerShell:

```powershell
cd C:\Users\EPALE\Documents\GitHub\cheque-extractor\backend
npm install
```

This will install:
- ✅ `cross-env` - Windows environment variable support
- ✅ `@google/generative-ai` - Gemini SDK
- ✅ All other backend dependencies

---

## 📦 **What Gets Installed**

### Dependencies:
- `@google/generative-ai` - Gemini 2.5 Flash SDK
- `express` - Web server
- `@supabase/supabase-js` - Database client
- `sharp` - Image processing
- `tesseract.js` - OCR
- `bull` - Job queue
- And more...

### Dev Dependencies:
- `cross-env` - **This fixes your error!**
- `nodemon` - Auto-restart on changes
- `ts-node` - TypeScript execution
- `typescript` - TypeScript compiler

---

## 🚀 **After Installation**

Once `npm install` completes, you can run:

```powershell
npm run dev
```

The backend will start on **http://localhost:3090**

---

## ⚠️ **If Installation Fails**

### Clean and Retry:
```powershell
# Remove node_modules and lock file
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue

# Fresh install
npm install
```

### If Still Failing:
1. Close all Node.js processes
2. Close VS Code
3. Reopen and try again

---

## 📝 **Next Steps After Install**

1. ✅ Install dependencies: `npm install`
2. Create `.env` file with your Gemini API key
3. Run backend: `npm run dev`
4. Run frontend: `cd ../frontend && npm run dev`

---

**Run `npm install` in the backend folder now!** 🎯
