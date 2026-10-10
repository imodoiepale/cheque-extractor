# Fix: Gemini API 400 Bad Request Errors

## 🔴 Error in Production Logs

```
requests.exceptions.HTTPError: 400 Client Error: Bad Request for url: 
https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSy...

Gemini error: All keys failed. Last: 400 Client Error
Gemini extracted: payee=None, amount=None, date=None, check#=None
```

---

## 🎯 Root Cause

Your Gemini API keys are **invalid or expired**. The 400 error means Google is rejecting the API keys.

**Keys that are failing:**
- `AIza...REDACTED`
- `AIza...REDACTED`

---

## ✅ Solution: Generate New Gemini API Keys

### **Step 1: Go to Google AI Studio**

1. Visit: https://aistudio.google.com/app/apikey
2. Sign in with your Google account

### **Step 2: Create New API Keys**

1. Click **"Create API Key"**
2. Select a Google Cloud project (or create new one)
3. Click **"Create API key in existing project"**
4. **Copy the key** (starts with `AIzaSy...`)
5. Repeat to create 2-3 keys for redundancy

### **Step 3: Update Railway Environment Variables**

1. Go to your Railway project dashboard
2. Click on your backend service
3. Go to **"Variables"** tab
4. Find `GEMINI_API_KEYS` variable
5. Update with your new keys (comma-separated):
   ```
   AIzaSyNEW_KEY_1,AIzaSyNEW_KEY_2,AIzaSyNEW_KEY_3
   ```
6. Click **"Save"**
7. Railway will auto-redeploy

### **Step 4: Verify Keys Work**

Test a key manually:
```bash
curl -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=YOUR_NEW_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [{"text": "Hello"}]
    }]
  }'
```

**Expected:** JSON response with generated text  
**If 400:** Key is invalid, regenerate

---

## 🔍 Why Keys Fail

### Common Reasons:

1. **API Key Expired**
   - Google API keys can expire
   - Need to regenerate periodically

2. **API Not Enabled**
   - Generative Language API not enabled in Google Cloud project
   - Go to: https://console.cloud.google.com/apis/library
   - Search "Generative Language API"
   - Click "Enable"

3. **Quota Exceeded**
   - Free tier has limits
   - Check quota: https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas

4. **Billing Not Set Up**
   - Some APIs require billing enabled
   - Go to: https://console.cloud.google.com/billing

5. **Wrong API Key Format**
   - Must start with `AIzaSy`
   - Must be 39 characters long
   - No spaces or extra characters

---

## 📋 Production Deployment Checklist

### **Railway Backend Environment Variables:**

```env
# Gemini API Keys (comma-separated for redundancy)
GEMINI_API_KEYS=AIzaSyKEY1,AIzaSyKEY2,AIzaSyKEY3

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Port
PORT=3090
```

### **Vercel Frontend Environment Variables:**

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# App URL
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

---

## 🧪 Test After Updating Keys

### **Method 1: Upload a PDF**
1. Go to your app
2. Upload a PDF with checks
3. Start extraction
4. Check Railway logs - should see:
   ```
   Gemini extracted: payee=JOHN DOE, amount=100.00, date=2025-01-15, check#=1234
   ```

### **Method 2: Check Railway Logs**
1. Railway dashboard → Your backend service
2. Click "Deployments" → Latest deployment
3. Click "View Logs"
4. Look for Gemini extraction logs
5. Should NOT see 400 errors

---

## 💡 Pro Tips

### **Use Multiple Keys for Redundancy**
```env
GEMINI_API_KEYS=KEY1,KEY2,KEY3
```
If one fails, system automatically tries the next.

### **Monitor API Usage**
- Go to: https://console.cloud.google.com/apis/dashboard
- Check daily usage
- Set up billing alerts

### **Keep Keys Secure**
- Never commit keys to Git
- Use environment variables only
- Rotate keys periodically

### **Test Keys Before Deploying**
```bash
# Test key validity
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"test"}]}]}'
```

---

## 🚨 Immediate Action Required

1. **Generate new Gemini API keys** (your current keys are invalid)
2. **Update Railway environment variables** with new keys
3. **Wait for auto-redeploy** (or manually redeploy)
4. **Test extraction** with a PDF upload

**Without valid Gemini keys, your extraction will fail and return empty data!**

---

## 📞 Still Getting 400 Errors?

Check these:

1. **API Enabled?**
   - https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com
   - Click "Enable" if not enabled

2. **Correct Model Name?**
   - Using: `gemini-2.0-flash`
   - Check if model exists: https://ai.google.dev/models

3. **Key Format Correct?**
   - Should be: `AIzaSy...` (39 chars)
   - No spaces, quotes, or extra characters

4. **Billing Enabled?**
   - Some features require billing
   - https://console.cloud.google.com/billing

5. **Region Restrictions?**
   - Gemini API may not be available in all regions
   - Check: https://ai.google.dev/available_regions

---

## 🎯 Summary

**Problem:** Gemini API keys are invalid → 400 errors → extraction fails  
**Solution:** Generate new keys → Update Railway env vars → Redeploy  
**Result:** Extraction works, data extracted successfully ✅

**Do this NOW to fix your production extraction!**
