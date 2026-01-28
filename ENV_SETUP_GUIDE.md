# 🔧 Environment Variables Setup Guide

## ⚠️ **Two Issues to Fix**

### 1. Backend Error: Missing Supabase Credentials
### 2. Frontend Styling: Tailwind CSS Not Loading

---

## 🔴 **Issue 1: Backend Missing Environment Variables**

**Error:**
```
Error: Missing Supabase credentials
```

### Fix: Verify `backend/.env` File

Your `backend/.env` file should contain:

```env
# Supabase
SUPABASE_URL=https://yqbmzerdagqevjdwhlwh.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxYm16ZXJkYWdxZXZqZHdobHdoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTYyMDY2MSwiZXhwIjoyMDg1MTk2NjYxfQ.6_bq1jeF0CEY7cB9qC60pONLeYhThmPKmJWUrb0C1No

# Gemini API
GEMINI_API_KEY=AIzaSyALrrfFmiZYxVtzpAjgaPz3FB_LkNhFOuo

# Server
PORT=3090
NODE_ENV=development
CORS_ORIGIN=http://localhost:3080

# Redis
REDIS_URL=redis://localhost:6379
```

**Check:**
1. Open `backend/.env` in VS Code
2. Make sure it has **ALL** the variables above
3. No typos in variable names (e.g., `SUPABASE_URL` not `SUPABASE_URI`)
4. Save the file

---

## 🎨 **Issue 2: Frontend Styling Broken**

The screenshot shows unstyled HTML - Tailwind CSS isn't loading.

### Root Cause: Turbopack Cache Issue

Next.js 14 with Turbopack sometimes doesn't pick up CSS changes immediately.

### Fix: Clear Cache and Restart

**Option 1: Delete `.next` folder (Recommended)**
```powershell
cd frontend
Remove-Item -Recurse -Force .next
npm run dev
```

**Option 2: Force rebuild**
```powershell
cd frontend
npm run build
npm run dev
```

**Option 3: Kill and restart**
```powershell
# Press Ctrl+C to stop frontend
# Then restart:
npm run dev
```

---

## 🔍 **Verify Frontend `.env.local`**

Your `frontend/.env.local` should contain:

```env
NEXT_PUBLIC_SUPABASE_URL=https://yqbmzerdagqevjdwhlwh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxYm16ZXJkYWdxZXZqZHdobHdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MjA2NjEsImV4cCI6MjA4NTE5NjY2MX0.0m_AeHUTQX1s-h5wbZfcdmS-uePpgd-9cI1m3CIeXi4
NEXT_PUBLIC_BACKEND_URL=http://localhost:3090
```

---

## ✅ **Step-by-Step Fix**

### 1. Fix Backend Environment Variables

```powershell
# Open backend/.env in VS Code
code backend\.env

# Verify it has all required variables (see above)
# Save the file

# Restart backend
cd backend
npm run dev
```

**Expected Output:**
```
[nodemon] starting `ts-node src/index.ts`
[INFO] Queue workers initialized
[INFO] Supabase client initialized
[INFO] Backend server started {"port":3090}
```

### 2. Fix Frontend Styling

```powershell
# Stop frontend (Ctrl+C)
cd frontend

# Delete cache
Remove-Item -Recurse -Force .next

# Restart
npm run dev
```

**Expected:** Login page should now have proper styling with:
- Blue buttons
- Rounded corners
- Proper spacing
- Shadow effects

---

## 🎯 **Quick Checklist**

- [ ] `backend/.env` exists and has all 7 variables
- [ ] `frontend/.env.local` exists and has all 3 variables
- [ ] Backend starts without "Missing Supabase credentials" error
- [ ] Frontend `.next` folder deleted and rebuilt
- [ ] Login page has proper Tailwind styling

---

## 🚨 **Still Not Working?**

### Backend Still Crashing?
Check the `.env` file encoding - should be UTF-8, not UTF-16.

### Frontend Still Unstyled?
1. Check browser console for errors
2. Verify `tailwind.config.js` exists
3. Try hard refresh: `Ctrl+Shift+R`
4. Clear browser cache

---

## 📝 **Summary**

**Backend Issue:** Missing environment variables in `backend/.env`
**Frontend Issue:** Turbopack cache not picking up Tailwind CSS

**Fix:** Verify `.env` files and delete `.next` folder, then restart both services.
