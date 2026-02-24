# 🔧 Fix Guide - QuickBooks & Gemini Issues

## 📊 Diagnosis Results

### Issue 1: QuickBooks Not Connected ⚠️
**Status:** Credentials saved ✅ | OAuth not completed ❌

**What's happening:**
- Your QB credentials are in `.env.local` and saved to database
- BUT you haven't completed the OAuth authorization flow
- Without OAuth, the app can't fetch data from QuickBooks Online

### Issue 2: Gemini API Keys Invalid ❌
**Status:** Both API keys returning 400 errors

**What's happening:**
- Key 1: `AIzaSyALrrfFmiZYxVtzpAjgaPz3FB_LkNhFOuo` - INVALID
- Key 2: `AIzaSyAqkmLfSmgjcTrXpWiczxNafK9nb6Dt30s` - INVALID
- Both keys are disabled, expired, or restricted
- Check extraction is failing because Gemini can't process images

---

## 🔨 Fix #1: Connect QuickBooks (5 minutes)

### Step-by-Step:

1. **Open Settings**
   ```
   http://localhost:3080/settings
   ```

2. **Go to Integrations Tab**
   - Click the "Integrations" tab at the top

3. **You should see:**
   - ✅ "Credentials configured (from .env.local)"
   - ❌ "Not connected - OAuth required"

4. **Click "Connect to QuickBooks"** (green button)
   - A popup window will open to Intuit
   - You may need to allow popups

5. **Authorize in Intuit Popup**
   - Sign in to your QuickBooks account
   - Select the company to connect
   - Click "Authorize"

6. **You'll be redirected back**
   - Status will change to ✅ "Connected to QuickBooks"
   - You'll see your Company ID

7. **Test the connection**
   - Go to: http://localhost:3080/qb-comparisons
   - Click "Sync from QuickBooks" in the orange banner
   - Data should start loading

### Verify Connection:
```powershell
# Run this to verify
powershell -ExecutionPolicy Bypass -File "diagnose-qb.ps1"
```

You should see:
```
✅ Integration record exists
- Access Token: ✓ Connected
- Realm ID: [Your Company ID]
```

---

## 🔨 Fix #2: Get New Gemini API Keys (10 minutes)

### Why Your Keys Failed:
- Google may have disabled them due to inactivity
- They may have hit spending limits
- They might be restricted to specific services

### Get New Keys:

1. **Go to Google AI Studio**
   ```
   https://aistudio.google.com/app/apikey
   ```

2. **Sign in with your Google account**

3. **Create a new API key**
   - Click "Create API Key"
   - Select "Create API key in new project" (or use existing)
   - Copy the key immediately (you won't see it again)

4. **Create 2-3 keys for redundancy**
   - The app rotates through multiple keys
   - This prevents rate limiting

5. **Update your `.env` file**
   
   Open: `c:\Users\inkno\Documents\GitHub\cheque-extractor\.env`
   
   Update this line:
   ```bash
   GEMINI_API_KEYS=AIzaSy...newkey1,AIzaSy...newkey2,AIzaSy...newkey3
   ```
   
   (Comma-separated, no spaces)

6. **Restart the backend**
   ```powershell
   # Stop the backend (Ctrl+C in the terminal)
   # Then restart:
   cd backend
   python api_server.py
   ```

7. **Test extraction**
   - Upload a new PDF with checks
   - Watch the backend logs
   - You should see successful Gemini extractions

### Verify Gemini Keys:
```powershell
# Run this to test new keys
powershell -ExecutionPolicy Bypass -File "test-gemini-keys.ps1"
```

You should see:
```
✅ VALID
Valid keys: 2/2 (or 3/3)
```

---

## 🎯 After Both Fixes

### Test QuickBooks Data Flow:

1. **Go to QB Comparisons page**
   ```
   http://localhost:3080/qb-comparisons
   ```

2. **You should see:**
   - Header badge: 🟢 "QB Connected" (green, pulsing)
   - No orange banner (data exists)
   - QB entries in the table with "Source" column showing "QB API"

3. **Sync more data:**
   - Click the refresh button
   - Or go to Settings → Integrations → "Sync Now"

### Test Check Extraction:

1. **Upload a PDF with checks**
   ```
   http://localhost:3080/upload
   ```

2. **Watch backend logs**
   - Should see: `Gemini extracted: payee=..., amount=..., date=...`
   - NOT: `Gemini extraction error: 400`

3. **Check results**
   - Go to Documents page
   - Click on the job
   - All fields should be extracted

---

## 🐛 Debugging Commands

### Check QB Connection:
```powershell
# Full diagnostic
powershell -ExecutionPolicy Bypass -File "diagnose-qb.ps1"

# Quick check
Invoke-RestMethod -Uri "http://localhost:3080/api/settings/integrations" | ConvertTo-Json
```

### Check Gemini Keys:
```powershell
# Test all keys
powershell -ExecutionPolicy Bypass -File "test-gemini-keys.ps1"

# Check backend env
cd backend
python -c "import os; print('Keys:', os.getenv('GEMINI_API_KEYS', 'NOT SET'))"
```

### Check QB Data:
```powershell
# Check Supabase directly
$headers = @{
    "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxYm16ZXJkYWdxZXZqZHdobHdoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTYyMDY2MSwiZXhwIjoyMDg1MTk2NjYxfQ.6_bq1jeF0CEY7cB9qC60pONLeYhThmPKmJWUrb0C1No"
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxYm16ZXJkYWdxZXZqZHdobHdoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTYyMDY2MSwiZXhwIjoyMDg1MTk2NjYxfQ.6_bq1jeF0CEY7cB9qC60pONLeYhThmPKmJWUrb0C1No"
}
Invoke-RestMethod -Uri "https://yqbmzerdagqevjdwhlwh.supabase.co/rest/v1/qb_entries?select=*&limit=5" -Headers $headers | ConvertTo-Json
```

### Manual QB Sync:
```powershell
# Trigger sync manually
Invoke-RestMethod -Uri "http://localhost:3080/api/qbo/pull-checks" -Method POST -ContentType "application/json" -Body '{"store":true}' | ConvertTo-Json
```

---

## 📝 Summary

**Current State:**
- ⚠️ QB: Configured but not connected (OAuth needed)
- ❌ Gemini: Both keys invalid (new keys needed)

**After Fixes:**
- ✅ QB: Connected and syncing data from QuickBooks Online
- ✅ Gemini: Extracting check data from PDFs
- ✅ Comparisons: Matching QB data with extracted checks

**Time Required:**
- QB OAuth: ~5 minutes
- Gemini keys: ~10 minutes
- Total: ~15 minutes

---

## 🆘 If Still Having Issues

### QuickBooks Issues:
1. Check redirect URI matches: `http://localhost:3080/api/qbo/callback`
2. Verify app is in "Development" mode in Intuit Developer Portal
3. Check browser console for errors during OAuth
4. Try disconnecting and reconnecting

### Gemini Issues:
1. Verify keys are for "Gemini API" not "Vertex AI"
2. Check Google Cloud Console for API restrictions
3. Enable billing if required
4. Try creating keys in a new project

### General:
1. Check both frontend (3080) and backend (3090) are running
2. Clear browser cache (Ctrl+Shift+R)
3. Check backend logs for detailed errors
4. Verify Supabase connection is working

---

## ✅ Success Indicators

**QuickBooks Connected:**
- Settings page shows: ✅ "Connected to QuickBooks"
- QB Comparisons page shows: 🟢 "QB Connected" badge
- Can see QB entries with "QB API" source

**Gemini Working:**
- Backend logs show: `Gemini extracted: payee=..., amount=...`
- Check extraction completes successfully
- All fields populated in Documents page

**Full Integration:**
- Upload PDF → Checks extracted
- QB data synced → Entries in database
- Comparisons page → Matched items highlighted green
