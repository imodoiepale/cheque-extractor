# API Keys & Security Management

## 🔐 Overview

Your application has a **secure API key management system** with the following features:

### ✅ What's Implemented

1. **Settings UI** - Located at `/settings/integrations`
2. **Secure Storage** - API keys stored in Supabase (encrypted at rest)
3. **Backend API** - Endpoints for managing settings
4. **QuickBooks Integration** - OAuth flow for QB Online
5. **AI Key Warning** - Alerts users when Gemini API key is missing

---

## 📍 Where to Manage API Keys

### Frontend UI
Navigate to: **Settings → Integrations**
- Path: `http://localhost:3080/settings/integrations`
- File: `frontend/app/(app)/settings/integrations/page.tsx`

### Features Available:
- ✅ **Google Gemini API Key** - For AI-powered extraction
- ✅ **QuickBooks Online** - OAuth connection
- ✅ **Webhooks** - Processing & export notifications
- ✅ **Status Indicators** - Shows connection status

---

## 🗄️ Storage Architecture

### Where API Keys Are Stored

#### 1. **Supabase Database** (Primary - Secure)
```sql
Table: app_settings
- gemini_api_key (TEXT, encrypted at rest)
- qbo_access_token (TEXT, encrypted at rest)
- qbo_refresh_token (TEXT, encrypted at rest)
- qbo_company_id (TEXT)
- qbo_connected (BOOLEAN)
```

#### 2. **Environment Variables** (Fallback)
```env
# .env or .env.local
GEMINI_API_KEY=your_key_here
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_key
```

### Storage Priority
1. **Supabase** (if configured) - Recommended for production
2. **Environment Variables** - Used as fallback or for local development

---

## 🔒 Security Features

### 1. **Encryption at Rest**
- Supabase encrypts all data at rest by default
- API keys are never exposed in API responses (only boolean status)

### 2. **Row Level Security (RLS)**
```sql
-- Only authenticated users can access settings
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
```

### 3. **Masked Display**
```typescript
// Frontend shows: ••••••••••••
// Never shows actual key
setGeminiApiKey(data.geminiApiKey ? '••••••••••••' : '');
```

### 4. **HTTPS Only** (Production)
- All API key transmissions use HTTPS
- No keys in URL parameters or logs

---

## 🔧 API Endpoints

### Backend (FastAPI)

#### Get Integration Status
```http
GET /api/settings/integrations
Response: {
  "geminiApiKey": true,  // boolean only
  "qboConnected": false,
  "storageType": "supabase"
}
```

#### Update API Keys
```http
PATCH /api/settings/integrations
Body: {
  "gemini_api_key": "your_actual_key"
}
Response: {
  "message": "Settings updated successfully",
  "geminiApiKey": true
}
```

#### Check API Key Status
```http
GET /api/settings/api-keys/status
Response: {
  "gemini": true,
  "supabase": true,
  "storage": "supabase"
}
```

---

## 📊 QuickBooks Data Storage

### Where QB Data Is Stored

#### 1. **QuickBooks Entries Table**
```sql
Table: quickbooks_entries
- check_number (TEXT)
- date (TEXT)
- amount (TEXT)
- payee (TEXT)
- account (TEXT)
- memo (TEXT)
```

#### 2. **Upload Process**
1. User uploads CSV/IIF file via UI
2. Frontend sends to `/api/quickbooks/upload`
3. Backend parses and stores in Supabase
4. Data available for comparison in QB Comparisons page

---

## 🚀 Setup Instructions

### 1. **Run Database Migration**

Execute the SQL migration in your Supabase dashboard:
```bash
# File: supabase-migrations.sql
# Go to Supabase Dashboard → SQL Editor → New Query
# Paste and run the migration
```

### 2. **Configure Environment Variables**

Create `.env.local` in frontend and backend:

**Frontend (.env.local):**
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_API_URL=http://localhost:3090
```

**Backend (.env):**
```env
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
GEMINI_API_KEY=your_gemini_key  # Optional: can be set via UI
PORT=3090
```

### 3. **Access Settings Page**

1. Start the application: `npm run dev`
2. Navigate to: `http://localhost:3080/settings/integrations`
3. Enter your Google Gemini API key
4. Click "Save API Keys"

---

## 🔄 How It Works

### API Key Flow

```mermaid
User enters key in UI
    ↓
Frontend sends to /api/settings/integrations
    ↓
Backend validates and stores in Supabase
    ↓
Backend updates os.environ for current session
    ↓
Extraction jobs use the key from environment
```

### QuickBooks Data Flow

```mermaid
User uploads CSV/IIF
    ↓
Frontend sends to /api/quickbooks/upload
    ↓
Backend parses file (CSV or IIF format)
    ↓
Stores entries in quickbooks_entries table
    ↓
QB Comparisons page fetches and matches with extractions
```

---

## 🛡️ Security Best Practices

### ✅ DO:
- Store API keys in Supabase (encrypted at rest)
- Use environment variables for local development
- Enable RLS policies in Supabase
- Use HTTPS in production
- Rotate keys periodically

### ❌ DON'T:
- Commit API keys to Git
- Expose keys in client-side code
- Log API keys in console
- Share keys in plain text
- Use same key across environments

---

## 🐛 Troubleshooting

### Issue: "API key not configured"
**Solution:** 
1. Go to `/settings/integrations`
2. Enter your Gemini API key
3. Click "Save API Keys"

### Issue: "Database not configured"
**Solution:**
1. Check Supabase environment variables
2. Run the SQL migration
3. Verify RLS policies are enabled

### Issue: "QuickBooks data not showing"
**Solution:**
1. Upload QB data via "Upload QB Data" button
2. Check file format (CSV or IIF)
3. Verify data in Supabase `quickbooks_entries` table

---

## 📝 For Intuit App Setup

Based on your screenshot, you need these URLs for Intuit OAuth:

### Development URLs
- **Host Name:** `localhost:3080` (or your Railway URL)
- **Launch URL:** `http://localhost:3080/settings/integrations`
- **Disconnect URL:** `http://localhost:3080/api/qbo/disconnect`
- **Redirect URI (OAuth callback):** `http://localhost:3080/api/qbo/callback`

### Production URLs (Railway)
- **Host Name:** `your-app.up.railway.app`
- **Launch URL:** `https://your-app.up.railway.app/settings/integrations`
- **Disconnect URL:** `https://your-app.up.railway.app/api/qbo/disconnect`
- **Redirect URI:** `https://your-app.up.railway.app/api/qbo/callback`

---

## 📚 Related Files

- **Settings UI:** `frontend/app/(app)/settings/integrations/page.tsx`
- **API Endpoint:** `frontend/pages/api/settings/integrations.ts`
- **Backend API:** `backend/api_server.py` (lines 1698-1812)
- **Database Schema:** `supabase-migrations.sql`
- **AI Warning:** `frontend/components/common/AIKeyWarning.tsx`

---

## ✨ Summary

Your application has a **complete, secure API key management system**:

1. ✅ **UI for managing keys** - `/settings/integrations`
2. ✅ **Secure storage** - Supabase with encryption
3. ✅ **Backend APIs** - Full CRUD operations
4. ✅ **QuickBooks integration** - OAuth + data comparison
5. ✅ **Security features** - RLS, masking, HTTPS

**All API keys are protected and never exposed in responses or logs.**
