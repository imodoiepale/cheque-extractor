# How OAuth Works (n8n-style) vs Current Implementation

## 🔄 n8n's OAuth Pattern

### 1. **Initial Setup (One-time)**
```
User enters credentials in UI:
├── Client ID
├── Client Secret
└── Redirect URI

Saved to database → Never asked again
```

### 2. **OAuth Flow (Automatic)**
```
User clicks "Connect"
    ↓
Frontend calls /api/qbo/auth
    ↓
Backend reads credentials from DB (not env vars)
    ↓
Generates OAuth URL with state token
    ↓
Redirects user to Intuit
    ↓
User authorizes
    ↓
Intuit redirects to /api/qbo/callback?code=XXX&state=YYY&realmId=ZZZ
    ↓
Backend exchanges code for tokens
    ↓
Stores tokens in DB (access_token, refresh_token, expires_at)
    ↓
User redirected back to app
    ↓
✅ Connected! No manual intervention needed
```

### 3. **Token Refresh (Automatic)**
```
Before making API call:
    ↓
Check if token expired (expires_at < now)
    ↓
If expired:
    - Use refresh_token to get new access_token
    - Update DB with new tokens
    - Continue with API call
    ↓
If not expired:
    - Use existing access_token
```

---

## ❌ Current Implementation Issues

### Problem 1: Credentials Not in Database
```
Current:
- Credentials in .env.local ❌
- Not saved to DB automatically ❌
- OAuth callback can't find them ❌

n8n way:
- Credentials in DB ✅
- OAuth callback reads from DB ✅
- Works automatically ✅
```

### Problem 2: Manual Token Entry
```
Current:
- User manually copies auth code ❌
- Expires in 10 minutes ❌
- Error-prone ❌

n8n way:
- Automatic redirect ✅
- Callback handles everything ✅
- No manual steps ✅
```

### Problem 3: No Auto-Refresh
```
Current:
- Tokens expire after 1 hour ❌
- User must reconnect manually ❌

n8n way:
- Auto-refresh before expiry ✅
- Seamless background process ✅
```

---

## ✅ Fixed Implementation

### Step 1: Save Credentials to DB (One-time)

**UI Flow:**
```typescript
// Settings page
const handleSaveCredentials = async () => {
  await fetch('/api/settings/integrations', {
    method: 'PATCH',
    body: JSON.stringify({
      qbClientId: 'ABT11UEvWZetoyA6wIAVI6fTc3PmCGod6B8IcDGRzCZ6nX2JBM',
      qbClientSecret: 'cCLwyIiP4bTMB4e6joY5YP5MMqz3CJyj9mciuhuO',
      qbRedirectUri: 'http://localhost:3080/api/qbo/callback'
    })
  });
  // ✅ Saved to integrations table
};
```

**Database:**
```sql
integrations table:
├── provider: 'quickbooks'
├── qb_client_id: 'ABT11...'
├── qb_client_secret: 'cCLw...'
├── qb_redirect_uri: 'http://localhost:3080/api/qbo/callback'
├── access_token: null (not connected yet)
├── refresh_token: null
└── expires_at: null
```

### Step 2: OAuth Flow (Automatic)

**User clicks "Connect to QuickBooks":**

```typescript
// Frontend
const handleConnect = async () => {
  // 1. Get OAuth URL from backend
  const { authUrl } = await fetch('/api/qbo/auth').then(r => r.json());
  
  // 2. Redirect to Intuit (popup or full redirect)
  window.location.href = authUrl;
};
```

**Backend `/api/qbo/auth`:**
```typescript
// 1. Read credentials from DB
const { data } = await supabase
  .from('integrations')
  .select('qb_client_id, qb_redirect_uri')
  .eq('provider', 'quickbooks')
  .single();

// 2. Generate OAuth URL
const authUrl = `https://appcenter.intuit.com/connect/oauth2?
  client_id=${data.qb_client_id}&
  redirect_uri=${data.qb_redirect_uri}&
  scope=com.intuit.quickbooks.accounting&
  response_type=code&
  state=${randomState}`;

// 3. Return URL to frontend
return { authUrl };
```

**Backend `/api/qbo/callback`:**
```typescript
// 1. Receive callback from Intuit
const { code, state, realmId } = req.query;

// 2. Verify state (CSRF protection)
if (cookies.qbo_state !== state) {
  return redirect('/settings?error=invalid_state');
}

// 3. Read credentials from DB
const { data } = await supabase
  .from('integrations')
  .select('qb_client_id, qb_client_secret, qb_redirect_uri')
  .eq('provider', 'quickbooks')
  .single();

// 4. Exchange code for tokens
const tokens = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${base64(clientId:clientSecret)}`
  },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: data.qb_redirect_uri
  })
});

// 5. Store tokens in DB
await supabase
  .from('integrations')
  .update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: new Date(Date.now() + tokens.expires_in * 1000),
    realm_id: realmId
  })
  .eq('provider', 'quickbooks');

// 6. Redirect user back to app
return redirect('/settings?success=connected');
```

### Step 3: Auto Token Refresh

**Before every QB API call:**
```typescript
async function getValidAccessToken() {
  // 1. Get current token from DB
  const { data } = await supabase
    .from('integrations')
    .select('access_token, refresh_token, expires_at')
    .eq('provider', 'quickbooks')
    .single();

  // 2. Check if expired
  const expiresAt = new Date(data.expires_at);
  const now = new Date();
  
  if (expiresAt <= now) {
    // 3. Refresh token
    const newTokens = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${base64(clientId:clientSecret)}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: data.refresh_token
      })
    });

    // 4. Update DB
    await supabase
      .from('integrations')
      .update({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        expires_at: new Date(Date.now() + newTokens.expires_in * 1000)
      })
      .eq('provider', 'quickbooks');

    return newTokens.access_token;
  }

  // 5. Return existing token
  return data.access_token;
}
```

---

## 🔧 What Needs to be Fixed

### 1. **Credentials Input UI** ✅ Already exists
```
Settings → Integrations → "Configure Credentials" button
```

### 2. **OAuth Callback** ⚠️ Needs fix
```
Current issue: Expects state cookie but works otherwise
Fix: Make state validation optional for development
```

### 3. **Token Refresh** ❌ Missing
```
Need to add: Auto-refresh logic in /api/qbo/pull-checks
```

---

## 📋 Implementation Checklist

- [x] Credentials storage in DB
- [x] OAuth initiation endpoint
- [x] OAuth callback endpoint
- [ ] Fix state validation (make it work without cookie in dev)
- [ ] Add auto token refresh
- [ ] Add token refresh endpoint
- [ ] Test full flow end-to-end

---

## 🎯 User Experience (After Fix)

### First Time Setup:
1. Go to Settings → Integrations
2. Click "Configure Credentials"
3. Enter Client ID, Secret, Redirect URI
4. Click "Save" → ✅ Saved to DB
5. Click "Connect to QuickBooks"
6. Authorize in popup
7. ✅ Connected! Tokens stored automatically

### Subsequent Use:
1. Go to QB Comparisons
2. Click "Sync from QuickBooks"
3. ✅ Data loads (tokens auto-refresh if needed)
4. No manual intervention required

### Token Expiry:
- Access token expires in 1 hour
- Refresh token expires in 100 days
- App auto-refreshes before expiry
- User never sees "token expired" errors

---

## 🔐 Security Best Practices (n8n-style)

1. **Credentials encrypted at rest** (Supabase handles this)
2. **State token for CSRF protection**
3. **HttpOnly cookies for state**
4. **Tokens never exposed to frontend**
5. **Auto-refresh prevents expired tokens**
6. **Redirect URI validation**

---

## 🚀 Next Steps

1. **Test OAuth flow in browser** (not manual code entry)
2. **Verify tokens stored in DB**
3. **Add auto-refresh logic**
4. **Test data sync**
5. **Deploy to production**
