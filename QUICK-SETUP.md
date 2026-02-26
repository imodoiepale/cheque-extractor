# 🚀 Quick Setup Guide - Copy & Paste Ready

## Frontend Environment Variables (Vercel)

Go to **Vercel Dashboard** → **Your Project** → **Settings** → **Environment Variables**

Copy and paste these, then **replace the placeholder parts**:

```env
NEXT_PUBLIC_BACKEND_URL=https://your-backend-url.railway.app

NEXT_PUBLIC_SUPABASE_URL=https://yqbmzerdagqevjdwhlwh.supabase.co

NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxYm16ZXJkYWdxZXZqZHdobHdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI1MzY5NzcsImV4cCI6MjA0ODExMjk3N30.YOUR_ANON_KEY_HERE

SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxYm16ZXJkYWdxZXZqZHdobHdoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMjUzNjk3NywiZXhwIjoyMDQ4MTEyOTc3fQ.YOUR_SERVICE_ROLE_KEY_HERE

QUICKBOOKS_CLIENT_ID=your_intuit_client_id

QUICKBOOKS_CLIENT_SECRET=your_intuit_client_secret

QUICKBOOKS_REDIRECT_URI=https://check-extractor-frontend.vercel.app/api/qbo/callback
```

### What to Replace:

1. **`NEXT_PUBLIC_BACKEND_URL`**: Your Railway/Render backend URL
   - Find in: Railway Dashboard → Your Service → Settings → Domains
   
2. **`YOUR_ANON_KEY_HERE`**: Replace with actual anon key from Supabase
   - Find in: Supabase Dashboard → Settings → API → anon/public key
   
3. **`YOUR_SERVICE_ROLE_KEY_HERE`**: Replace with actual service role key
   - Find in: Supabase Dashboard → Settings → API → service_role key
   
4. **QuickBooks credentials**: From Intuit Developer Dashboard
   - Find in: developer.intuit.com → Your App → Keys & Credentials

---

## Backend Environment Variables (Railway)

Go to **Railway Dashboard** → **Your Service** → **Variables** → **+ New Variable**

Copy and paste these, then **replace the placeholder parts**:

```env
NEXT_PUBLIC_SUPABASE_URL=https://yqbmzerdagqevjdwhlwh.supabase.co

SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxYm16ZXJkYWdxZXZqZHdobHdoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMjUzNjk3NywiZXhwIjoyMDQ4MTEyOTc3fQ.YOUR_SERVICE_ROLE_KEY_HERE

GEMINI_API_KEYS=AIzaSyABC123_YOUR_FIRST_KEY,AIzaSyDEF456_YOUR_SECOND_KEY

OPENAI_API_KEY=sk-proj-ABC123_YOUR_OPENAI_KEY_HERE

PORT=3090
```

### What to Replace:

1. **`YOUR_SERVICE_ROLE_KEY_HERE`**: Replace with actual service role key
   - Find in: Supabase Dashboard → Settings → API → service_role key
   
2. **`GEMINI_API_KEYS`**: Replace with your Gemini API key(s)
   - Get from: https://aistudio.google.com/app/apikey
   - Can use multiple keys separated by commas
   
3. **`OPENAI_API_KEY`**: Replace with your OpenAI API key
   - Get from: https://platform.openai.com/api-keys

---

## 📍 Where to Find Your Keys

### Supabase Keys
1. Go to https://supabase.com
2. Select your project: **yqbmzerdagqevjdwhlwh**
3. **Settings** (gear icon) → **API**
4. Copy:
   - **Project URL** (already filled in above)
   - **anon public** key → Replace `YOUR_ANON_KEY_HERE`
   - **service_role** key → Replace `YOUR_SERVICE_ROLE_KEY_HERE`

### Gemini API Key
1. Go to https://aistudio.google.com/app/apikey
2. Click **Create API Key**
3. Select your Google Cloud project
4. Copy the key → Replace `AIzaSyABC123_YOUR_FIRST_KEY`

### OpenAI API Key
1. Go to https://platform.openai.com/api-keys
2. Click **Create new secret key**
3. Copy the key → Replace `sk-proj-ABC123_YOUR_OPENAI_KEY_HERE`
4. **Note**: Requires billing setup

### QuickBooks OAuth
1. Go to https://developer.intuit.com
2. **Dashboard** → **My Apps** → Select your app
3. **Keys & Credentials** tab
4. Copy:
   - **Client ID** → Replace `your_intuit_client_id`
   - **Client Secret** → Replace `your_intuit_client_secret`
5. **Redirect URIs** → Add exactly:
   - `https://check-extractor-frontend.vercel.app/api/qbo/callback`

### Backend URL (Railway)
1. Go to https://railway.app
2. Select your project
3. Click on your service
4. **Settings** → **Domains**
5. Copy the URL → Replace `https://your-backend-url.railway.app`

---

## ✅ After Setting Variables

### Vercel (Frontend)
1. Click **Save** on each variable
2. Go to **Deployments** tab
3. Click **Redeploy** on the latest deployment

### Railway (Backend)
1. Variables are auto-saved
2. Service will **automatically redeploy**
3. Wait for deployment to complete (~2-3 minutes)

---

## 🧪 Test Your Setup

1. **Upload Test**: 
   - Go to your Vercel URL → Upload page
   - Upload a PDF (should work without 413 error)

2. **Extraction Test**:
   - Start extraction
   - Should use Gemini by default
   - Check backend logs for success

3. **QuickBooks Test** (if configured):
   - Settings → Integrations
   - Click "Connect QuickBooks"
   - Should redirect to Intuit properly

---

## 🐛 Common Issues

**413 Error on Upload**
- Missing `NEXT_PUBLIC_BACKEND_URL` in Vercel
- Solution: Add the variable and redeploy

**QuickBooks OAuth Error**
- Redirect URI mismatch
- Solution: Ensure exact match in Intuit app settings

**Extraction Fails**
- Missing Gemini API key in Railway
- Solution: Add `GEMINI_API_KEYS` variable

**Database Errors**
- Wrong Supabase keys
- Solution: Double-check keys from Supabase dashboard
