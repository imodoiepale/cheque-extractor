# 🎯 Intuit App URLs - Quick Reference

## Copy-Paste Ready URLs for Your Intuit App Setup

---

## 🏠 **DEVELOPMENT ENVIRONMENT**

Use these for local testing:

### Host Name
```
localhost:3080
```

### Launch URL
```
http://localhost:3080/settings/integrations
```

### Disconnect URL
```
http://localhost:3080/api/qbo/disconnect
```

### Redirect URI (OAuth callback)
```
http://localhost:3080/api/qbo/callback
```

---

## 🚀 **PRODUCTION ENVIRONMENT**

**IMPORTANT:** Replace `YOUR-RAILWAY-URL` with your actual Railway URL after deployment.

### Example Railway URL Format:
```
cheque-extractor-production.up.railway.app
```

### Host Name
```
YOUR-RAILWAY-URL.up.railway.app
```

### Launch URL
```
https://YOUR-RAILWAY-URL.up.railway.app/settings/integrations
```

### Disconnect URL
```
https://YOUR-RAILWAY-URL.up.railway.app/api/qbo/disconnect
```

### Redirect URI (OAuth callback)
```
https://YOUR-RAILWAY-URL.up.railway.app/api/qbo/callback
```

---

## 📋 **DEPLOYMENT WORKFLOW**

### Step 1: Deploy to Railway
```bash
# Push to GitHub
git add .
git commit -m "Add QuickBooks OAuth"
git push origin main

# Deploy on Railway
# Go to railway.app → New Project → Deploy from GitHub
```

### Step 2: Get Railway URL
After deployment, Railway provides a URL like:
```
https://cheque-extractor-production-abc123.up.railway.app
```

### Step 3: Configure Intuit App
1. Go to https://developer.intuit.com/app/developer/dashboard
2. Create new app
3. Use the URLs above (replace YOUR-RAILWAY-URL with actual URL)
4. Get Client ID and Client Secret

### Step 4: Add to Railway Environment Variables
```env
INTUIT_CLIENT_ID=your_client_id_here
INTUIT_CLIENT_SECRET=your_client_secret_here
INTUIT_REDIRECT_URI=https://your-railway-url.up.railway.app/api/qbo/callback
FRONTEND_URL=https://your-railway-url.up.railway.app
```

---

## ✅ **VERIFICATION CHECKLIST**

Before submitting to Intuit:

- [ ] Railway URL is HTTPS (not HTTP)
- [ ] No trailing slashes on any URL
- [ ] Redirect URI exactly matches what's in Railway env vars
- [ ] All 4 URLs are configured (Host, Launch, Disconnect, Redirect)
- [ ] Both Development and Production environments configured

---

## 🔧 **ENVIRONMENT VARIABLES NEEDED**

### Railway Dashboard → Your Project → Variables

```env
# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# QuickBooks OAuth (Required)
INTUIT_CLIENT_ID=ABxxxxxxxxxxxxxxxxxxxxxxxxxxxx
INTUIT_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
INTUIT_REDIRECT_URI=https://your-url.up.railway.app/api/qbo/callback
FRONTEND_URL=https://your-url.up.railway.app

# Google Gemini (Optional - can set via UI)
GEMINI_API_KEY=your_gemini_key

# Server
PORT=3090
```

---

## 🎨 **OAUTH FLOW**

```
User → Settings → Connect to QuickBooks
    ↓
/api/qbo/auth (generates OAuth URL)
    ↓
Intuit OAuth Page (user authorizes)
    ↓
/api/qbo/callback (receives code, exchanges for token)
    ↓
Tokens saved to Supabase
    ↓
Redirect to /settings/integrations?qbo=connected
    ↓
Status shows "Connected" ✅
```

---

## 🐛 **COMMON ISSUES**

### "Redirect URI mismatch"
- Check URL in Intuit **exactly** matches Railway env var
- No trailing slash
- HTTPS in production, HTTP in development

### "Invalid client credentials"
- Verify Client ID/Secret in Railway env vars
- Redeploy after adding env vars

### "Connection not showing"
- Run database migration in Supabase
- Check RLS policies are enabled
- Verify tokens in `app_settings` table

---

## 📞 **SUPPORT ENDPOINTS**

Your app will have these OAuth endpoints:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/qbo/auth` | Initiate OAuth flow |
| `GET /api/qbo/callback` | OAuth callback handler |
| `POST /api/qbo/disconnect` | Disconnect QB |
| `GET /api/qbo/status` | Check connection status |

---

## 🎯 **FINAL URLS (Example)**

If your Railway URL is: `cheque-extractor-prod.up.railway.app`

**Production:**
```
Host Name: cheque-extractor-prod.up.railway.app
Launch URL: https://cheque-extractor-prod.up.railway.app/settings/integrations
Disconnect URL: https://cheque-extractor-prod.up.railway.app/api/qbo/disconnect
Redirect URI: https://cheque-extractor-prod.up.railway.app/api/qbo/callback
```

**Development:**
```
Host Name: localhost:3080
Launch URL: http://localhost:3080/settings/integrations
Disconnect URL: http://localhost:3080/api/qbo/disconnect
Redirect URI: http://localhost:3080/api/qbo/callback
```

---

**Ready to deploy!** 🚀

See `DEPLOYMENT-GUIDE.md` for detailed step-by-step instructions.
