# Fix: "QuickBooks OAuth not configured" Error

## 🔴 Error Message
```json
{
  "detail": "QuickBooks OAuth not configured"
}
```

This error appears when you click "Connect to QuickBooks" but the credentials aren't saved to the database yet.

---

## ✅ Solution: Save Credentials to Database

### Step 1: Get Your QuickBooks Credentials

You need these from your Intuit Developer account:

1. **Client ID** - Your app's client ID from Intuit Developer Portal
2. **Client Secret** - Your app's client secret
3. **Redirect URI** - Should be: `http://localhost:3080/api/qbo/callback`

**Where to find them:**
- Go to: https://developer.intuit.com/app/developer/myapps
- Select your app
- Go to "Keys & OAuth" tab
- Copy Client ID and Client Secret

---

### Step 2: Save Credentials in Settings

1. **Open Settings → Integrations**
2. **Scroll to QuickBooks section**
3. **Click "Configure Credentials"** button
4. **Enter your credentials:**
   - Client ID: `AB...xyz` (from Intuit)
   - Client Secret: `abc...123` (from Intuit)
   - Redirect URI: `http://localhost:3080/api/qbo/callback` (default)
5. **Click "Save Credentials"**
6. **Wait for success message**

---

### Step 3: Connect to QuickBooks

1. **Click "Connect to QuickBooks"** button
2. **Authorize in popup window**
3. **Return to Settings**
4. **Should show "Connected" status**

---

## 🔍 Why This Happens

### The Problem:
- QuickBooks credentials can be in `.env.local` file
- But OAuth flow needs them in the **database**
- Frontend checks database first, then falls back to env vars
- If neither exists → error

### The Fix:
- Save credentials to database via Settings UI
- System stores in `integrations` table in Supabase
- OAuth flow reads from database
- Works seamlessly after that

---

## 🧪 Verify Credentials Are Saved

### Method 1: Check in Browser Console
```javascript
// On Settings page, open console (F12) and run:
fetch('/api/settings/integrations')
  .then(r => r.json())
  .then(data => {
    console.log('QB Configured:', data.qbConfigured);
    console.log('QB Connected:', data.qboConnected);
    console.log('Client ID:', data.qbClientId); // Should show masked value
  });
```

**Expected output:**
```javascript
{
  qbConfigured: true,  // ✅ Credentials saved
  qboConnected: false, // Not connected yet (need to authorize)
  qbClientId: "••••••••AB1234" // Masked client ID
}
```

### Method 2: Check Database Directly
If you have Supabase access:
```sql
SELECT 
  provider,
  qb_client_id IS NOT NULL as has_client_id,
  qb_client_secret IS NOT NULL as has_client_secret,
  qb_redirect_uri,
  access_token IS NOT NULL as is_connected
FROM integrations 
WHERE provider = 'quickbooks';
```

---

## 🔧 Troubleshooting

### Error: "QuickBooks OAuth not configured"
**Cause:** Credentials not saved to database  
**Fix:** Follow Step 2 above to save credentials

### Error: "QuickBooks not configured" (different message)
**Cause:** No credentials in database OR environment  
**Fix:** Add credentials to `.env.local` OR save via Settings UI

### Credentials Dialog Opens Automatically
**Cause:** System detected missing credentials  
**Fix:** This is expected - enter your credentials and save

### "Configure Credentials" Button Not Visible
**Cause:** Credentials already saved  
**Fix:** Click "Connect to QuickBooks" to authorize

### Connection Works But Sync Fails
**Cause:** Different issue - connection is fine, sync has problem  
**Fix:** Check browser console for sync errors

---

## 📋 Complete Setup Checklist

- [ ] Have QuickBooks Developer account
- [ ] Created app in Intuit Developer Portal
- [ ] Copied Client ID and Client Secret
- [ ] Set Redirect URI to `http://localhost:3080/api/qbo/callback` in Intuit portal
- [ ] Opened Settings → Integrations in your app
- [ ] Clicked "Configure Credentials"
- [ ] Entered Client ID, Client Secret, Redirect URI
- [ ] Clicked "Save Credentials"
- [ ] Saw success message
- [ ] Clicked "Connect to QuickBooks"
- [ ] Authorized in popup
- [ ] Returned to Settings
- [ ] Saw "Connected" status
- [ ] Went to QB Comparisons page
- [ ] Clicked "Sync from QuickBooks"
- [ ] Data appeared with "QB API" badges

---

## 🎯 What Changed

### Before (Broken):
1. Credentials only in `.env.local`
2. Click "Connect to QuickBooks"
3. OAuth flow tries to read from database
4. Database has no credentials
5. **Error: "QuickBooks OAuth not configured"**

### After (Fixed):
1. Credentials in `.env.local` AND database
2. Click "Connect to QuickBooks"
3. OAuth flow reads from database ✅
4. Redirects to QuickBooks authorization
5. **Success!**

---

## 💡 Pro Tips

1. **Save credentials BEFORE connecting**
   - Don't click "Connect" until credentials are saved
   - System will prompt you if they're missing

2. **Use the Configure Credentials dialog**
   - Easier than editing database directly
   - Validates input
   - Shows success/error messages

3. **Check console logs**
   - Open browser console (F12)
   - Look for OAuth flow logs
   - Shows where credentials are loaded from

4. **Redirect URI must match exactly**
   - In Intuit portal: `http://localhost:3080/api/qbo/callback`
   - In Settings: `http://localhost:3080/api/qbo/callback`
   - Case-sensitive, no trailing slash

5. **Test connection after setup**
   - Use "Test Connection" button in Settings
   - Verifies OAuth and API access
   - Shows company name and entry count

---

## 📞 Still Having Issues?

Check the logs in terminal where frontend is running:
```
🔍 QB OAuth - Integration data: { hasIntegration: false, ... }
🔑 QB OAuth - Using credentials: { clientId: 'MISSING', ... }
❌ QB OAuth - No client ID found in database or environment
```

This tells you exactly what's missing!
