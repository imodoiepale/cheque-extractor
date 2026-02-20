# 🚀 Deployment Guide - Railway + QuickBooks OAuth

## 📋 Step-by-Step Deployment

### **Step 1: Deploy to Railway First**

You need to deploy your app to Railway **before** setting up the Intuit app, so you have the production URLs.

#### 1.1 Push to GitHub
```bash
git add .
git commit -m "Add QuickBooks OAuth integration"
git push origin main
```

#### 1.2 Deploy to Railway
1. Go to [Railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your `cheque-extractor` repository
5. Railway will automatically detect and deploy

#### 1.3 Get Your Railway URL
After deployment, Railway will provide a URL like:
```
https://cheque-extractor-production.up.railway.app
```

**Save this URL - you'll need it for Intuit setup!**

---

## 🔧 Step 2: Configure Environment Variables in Railway

In your Railway project dashboard, add these environment variables:

### Required Variables:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Google Gemini (optional - can be set via UI later)
GEMINI_API_KEY=your_gemini_key

# QuickBooks OAuth
INTUIT_CLIENT_ID=your_client_id_from_intuit
INTUIT_CLIENT_SECRET=your_client_secret_from_intuit
INTUIT_REDIRECT_URI=https://your-railway-url.up.railway.app/api/qbo/callback
FRONTEND_URL=https://your-railway-url.up.railway.app

# Server
PORT=3090
```

**Note:** You'll get `INTUIT_CLIENT_ID` and `INTUIT_CLIENT_SECRET` after creating the Intuit app in Step 3.

---

## 📱 Step 3: Create Intuit QuickBooks App

### 3.1 Go to Intuit Developer Portal
Visit: https://developer.intuit.com/app/developer/dashboard

### 3.2 Create New App
1. Click "Create an app"
2. Select "QuickBooks Online and Payments"
3. Choose your app name (e.g., "Cheque Extractor")

### 3.3 Configure App Settings

Use your **Railway URL** from Step 1:

#### **Development Environment:**

| Field | Value |
|-------|-------|
| **Host Name** | `localhost:3080` |
| **Launch URL** | `http://localhost:3080/settings/integrations` |
| **Disconnect URL** | `http://localhost:3080/api/qbo/disconnect` |
| **Redirect URI** | `http://localhost:3080/api/qbo/callback` |

#### **Production Environment:**

Replace `YOUR-RAILWAY-URL` with your actual Railway URL:

| Field | Value |
|-------|-------|
| **Host Name** | `your-railway-url.up.railway.app` |
| **Launch URL** | `https://your-railway-url.up.railway.app/settings/integrations` |
| **Disconnect URL** | `https://your-railway-url.up.railway.app/api/qbo/disconnect` |
| **Redirect URI** | `https://your-railway-url.up.railway.app/api/qbo/callback` |

### 3.4 Get Your Credentials

After creating the app, Intuit will provide:
- **Client ID** (e.g., `ABxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)
- **Client Secret** (e.g., `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)

**Save these securely!**

---

## 🔐 Step 4: Update Railway Environment Variables

Go back to Railway and add the Intuit credentials:

```env
INTUIT_CLIENT_ID=your_actual_client_id
INTUIT_CLIENT_SECRET=your_actual_client_secret
INTUIT_REDIRECT_URI=https://your-railway-url.up.railway.app/api/qbo/callback
```

**Important:** After adding these, Railway will automatically redeploy your app.

---

## ✅ Step 5: Test the Integration

### 5.1 Local Testing (Development)

1. Update your local `.env` file:
```env
INTUIT_CLIENT_ID=your_client_id
INTUIT_CLIENT_SECRET=your_client_secret
INTUIT_REDIRECT_URI=http://localhost:3080/api/qbo/callback
FRONTEND_URL=http://localhost:3080
```

2. Start your app:
```bash
npm run dev
```

3. Navigate to: `http://localhost:3080/settings/integrations`

4. Click "Connect to QuickBooks"

5. You'll be redirected to Intuit's OAuth page

6. Authorize the app

7. You'll be redirected back to your app with `?qbo=connected`

### 5.2 Production Testing

1. Navigate to: `https://your-railway-url.up.railway.app/settings/integrations`

2. Click "Connect to QuickBooks"

3. Authorize the app

4. Verify connection status shows "Connected"

---

## 📊 Step 6: Run Database Migration

Execute the SQL migration in Supabase to create the required tables:

1. Go to Supabase Dashboard → SQL Editor
2. Copy contents from `supabase-migrations.sql`
3. Paste and click "Run"

This creates:
- ✅ `app_settings` table (for OAuth tokens)
- ✅ `quickbooks_entries` table (for comparison data)
- ✅ All necessary indexes and RLS policies

---

## 🔄 OAuth Flow Diagram

```
User clicks "Connect to QuickBooks"
    ↓
Frontend calls /api/qbo/auth
    ↓
Backend generates OAuth URL with client_id
    ↓
User redirected to Intuit OAuth page
    ↓
User authorizes the app
    ↓
Intuit redirects to /api/qbo/callback with code
    ↓
Backend exchanges code for access_token
    ↓
Tokens stored in Supabase (encrypted)
    ↓
User redirected to /settings/integrations?qbo=connected
    ↓
Connection status shows "Connected" ✅
```

---

## 🎯 Exact URLs for Your Intuit App

Based on your screenshot, here are the **exact values** to enter:

### If Your Railway URL is: `cheque-extractor-production.up.railway.app`

**Production Configuration:**

```
Host Name:
cheque-extractor-production.up.railway.app

Launch URL:
https://cheque-extractor-production.up.railway.app/settings/integrations

Disconnect URL:
https://cheque-extractor-production.up.railway.app/api/qbo/disconnect

Redirect URI (OAuth callback):
https://cheque-extractor-production.up.railway.app/api/qbo/callback
```

**Development Configuration:**

```
Host Name:
localhost:3080

Launch URL:
http://localhost:3080/settings/integrations

Disconnect URL:
http://localhost:3080/api/qbo/disconnect

Redirect URI (OAuth callback):
http://localhost:3080/api/qbo/callback
```

---

## 🔒 Security Notes

### OAuth Tokens Storage:
- ✅ Stored in Supabase `app_settings` table
- ✅ Encrypted at rest by Supabase
- ✅ Protected by Row Level Security (RLS)
- ✅ Never exposed in API responses
- ✅ Automatically refreshed when expired

### Environment Variables:
- ✅ Never commit to Git
- ✅ Set in Railway dashboard only
- ✅ Use different credentials for dev/prod

---

## 🐛 Troubleshooting

### Error: "Redirect URI mismatch"
**Solution:** 
- Verify the URI in Intuit **exactly** matches your Railway URL
- Check for trailing slashes (don't add them)
- Ensure protocol matches (http vs https)

### Error: "Invalid client credentials"
**Solution:**
- Double-check Client ID and Secret in Railway
- Verify they match what Intuit provided
- Redeploy Railway after updating env vars

### Error: "OAuth callback failed"
**Solution:**
- Check Railway logs for detailed error
- Verify Supabase is configured correctly
- Ensure database migration was run

### Connection shows "Not connected" after OAuth
**Solution:**
- Check if tokens were saved to Supabase
- Verify RLS policies are enabled
- Check browser console for errors

---

## 📝 Checklist

Before going live, ensure:

- [ ] App deployed to Railway
- [ ] Railway URL obtained
- [ ] Intuit app created with correct URLs
- [ ] Client ID and Secret added to Railway env vars
- [ ] Database migration run in Supabase
- [ ] Local testing successful
- [ ] Production testing successful
- [ ] OAuth flow works end-to-end
- [ ] Tokens stored in Supabase
- [ ] Connection status shows correctly

---

## 🎉 You're Ready!

Once all steps are complete:

1. ✅ Your app is deployed on Railway
2. ✅ QuickBooks OAuth is configured
3. ✅ Users can connect their QuickBooks account
4. ✅ Data is securely stored in Supabase
5. ✅ QB Comparisons page can match data

**Your app is production-ready!** 🚀

---

## 📞 Need Help?

If you encounter issues:
1. Check Railway deployment logs
2. Check browser console for errors
3. Verify all environment variables are set
4. Ensure database migration was successful
5. Test OAuth flow in development first

---

## 🔗 Useful Links

- **Railway Dashboard:** https://railway.app/dashboard
- **Intuit Developer Portal:** https://developer.intuit.com/app/developer/dashboard
- **Supabase Dashboard:** https://app.supabase.com
- **QuickBooks API Docs:** https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/account

---

**Last Updated:** February 20, 2026
