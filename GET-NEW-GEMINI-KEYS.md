# 🔑 Get New Gemini API Keys (URGENT)

## ❌ Current Problem

Both your Gemini API keys are **INVALID** and returning 400 errors:
- `AIzaSyALrrfFmiZYxVtzpAjgaPz3FB_LkNhFOuo` ❌
- `AIzaSyAqkmLfSmgjcTrXpWiczxNafK9nb6Dt30s` ❌

**Result:** Check extraction is completely broken - all fields showing as `None`

---

## ✅ Solution: Get New Keys (5 minutes)

### Step 1: Go to Google AI Studio

**Open this link:**
```
https://aistudio.google.com/app/apikey
```

### Step 2: Sign In
- Use your Google account
- Accept terms if prompted

### Step 3: Create API Keys

**Create 3 keys for redundancy:**

1. Click **"Create API Key"**
2. Select **"Create API key in new project"** (or use existing)
3. **Copy the key immediately** (you won't see it again!)
4. Repeat 2 more times

**You should have 3 keys like:**
```
AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
AIzaSyYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY
AIzaSyZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ
```

---

## 📝 Step 4: Update .env File

**Open:** `c:\Users\inkno\Documents\GitHub\cheque-extractor\.env`

**Find this line:**
```bash
GEMINI_API_KEYS=AIzaSyALrrfFmiZYxVtzpAjgaPz3FB_LkNhFOuo,AIzaSyAqkmLfSmgjcTrXpWiczxNafK9nb6Dt30s
```

**Replace with your new keys (comma-separated, NO SPACES):**
```bash
GEMINI_API_KEYS=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX,AIzaSyYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY,AIzaSyZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ
```

**Save the file!**

---

## 🔄 Step 5: Restart Backend

**Stop the backend:**
- Go to the terminal running the backend
- Press `Ctrl+C`

**Start it again:**
```powershell
cd backend
python api_server.py
```

**You should see:**
```
Loaded 3 Gemini API keys
```

---

## ✅ Step 6: Test Extraction

**Upload a new PDF:**
1. Go to http://localhost:3080/upload
2. Upload a PDF with checks
3. Watch backend logs

**Expected output:**
```
Gemini extracted: payee=ACME Corp, amount=1250.00, date=2024-01-15, check#=1001
✓ Extraction successful
```

**NOT:**
```
Gemini extraction error: 400 Client Error
payee=None, amount=None
```

---

## 🧪 Quick Test

**After updating keys and restarting, run:**
```powershell
powershell -ExecutionPolicy Bypass -File "test-gemini-keys.ps1"
```

**Expected:**
```
Testing key: AIzaSyXXXXXXXXXXXXXX... ✅ VALID
Testing key: AIzaSyYYYYYYYYYYYYYY... ✅ VALID
Testing key: AIzaSyZZZZZZZZZZZZZZ... ✅ VALID

Valid keys: 3/3 ✅
```

---

## ⚠️ Important Notes

### Why Keys Failed:
- Google may have disabled them for inactivity
- They may be restricted to specific services
- Spending limits may be hit
- They may be expired

### Key Requirements:
- Must be for **"Gemini API"** (not Vertex AI)
- Must have **"Generative Language API"** enabled
- No IP restrictions (or allow your IP)
- No spending limits (or set high enough)

### Best Practices:
- Create 3 keys for redundancy
- App rotates through keys to avoid rate limits
- Keep keys secret (never commit to git)
- Monitor usage in Google Cloud Console

---

## 🆘 If Keys Still Fail

### Check API is Enabled:
1. Go to https://console.cloud.google.com
2. Select your project
3. Go to **APIs & Services → Library**
4. Search for **"Generative Language API"**
5. Click **"Enable"** if not enabled

### Check Billing:
1. Go to https://console.cloud.google.com/billing
2. Make sure billing is enabled
3. Gemini API has a free tier but needs billing account

### Check Restrictions:
1. Go to https://console.cloud.google.com/apis/credentials
2. Click on your API key
3. Check **"API restrictions"**
4. Should allow **"Generative Language API"**
5. Check **"Application restrictions"**
6. Should be **"None"** or allow your IP

---

## 📊 After Fix

**You should see in backend logs:**
```
[1/12] check_0001 (page 1)...
Gemini extracted: payee=ACME SUPPLIES, amount=850.00, date=2023-12-05, check#=1001
✓ T:1234ms N:567ms G:2345ms | payee=ACME SUPPLIES

[2/12] check_0002 (page 1)...
Gemini extracted: payee=TECH SERVICES INC, amount=1250.50, date=2023-12-10, check#=1002
✓ T:1123ms N:543ms G:2234ms | payee=TECH SERVICES INC
```

**NOT:**
```
Gemini extraction error: 400 Client Error
payee=None, amount=None, date=None, check#=None
```

---

## 🎯 Summary

**Current state:** ❌ Gemini keys invalid → extraction broken  
**Action needed:** Get 3 new keys from Google AI Studio  
**Time required:** 5 minutes  
**Impact:** Fixes all check extraction

**Do this NOW before testing QuickBooks OAuth!**
