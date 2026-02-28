# Vercel Backend URL Configuration Fix

## 🚨 Current Issue

Frontend on Vercel is getting CORS errors because it's trying to connect to the wrong backend URL.

## ✅ Correct Railway Backend URL

```
https://check-extractor-production-2026.up.railway.app
```

**Note:** It's `check-extractor` (without 'que'), not `cheque-extractor`

## 🔧 Fix Required on Vercel

### Step 1: Go to Vercel Dashboard
1. Visit: https://vercel.com/dashboard
2. Select your project: `check-extractor-frontend` or `cheque-extractor-frontend`

### Step 2: Update Environment Variable
1. Click **"Settings"** tab
2. Click **"Environment Variables"** in left sidebar
3. Find: `NEXT_PUBLIC_BACKEND_URL`

### Step 3: Set Correct Value

**Current Value (WRONG):**
```
https://cheque-extractor-production-2026.up.railway.app
```
OR
```
https://check-extractor-production-2026.up.railway.app/
```
(with trailing slash)

**Correct Value:**
```
https://check-extractor-production-2026.up.railway.app
```

**Important:** 
- ✅ Use `check-extractor` (not `cheque-extractor`)
- ✅ NO trailing slash at the end
- ✅ Apply to all environments (Production, Preview, Development)

### Step 4: Redeploy
1. After saving, Vercel will auto-redeploy
2. Wait 1-2 minutes for deployment to complete

## 🧪 Verify After Deployment

Test the health endpoint from your browser console:
```javascript
fetch('https://check-extractor-production-2026.up.railway.app/api/health')
  .then(r => r.json())
  .then(console.log)
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-28T..."
}
```

## 📋 All Frontend Code Already Correct

The frontend code correctly uses the environment variable:
- ✅ `pages/api/*.ts` - All API routes use `NEXT_PUBLIC_BACKEND_URL`
- ✅ `app/(app)/upload/page.tsx` - Upload page uses env var
- ✅ `app/(app)/analytics/page.tsx` - Analytics uses env var
- ✅ All other components use env var

**No code changes needed** - just update the Vercel environment variable.

## 🎯 Summary

1. **Problem:** Vercel has wrong backend URL or URL with trailing slash
2. **Solution:** Set `NEXT_PUBLIC_BACKEND_URL=https://check-extractor-production-2026.up.railway.app` on Vercel
3. **Result:** CORS errors will be fixed, frontend will connect to backend successfully
