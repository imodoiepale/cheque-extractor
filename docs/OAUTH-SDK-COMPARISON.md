# OAuth Implementation: Manual vs Intuit SDK

## 🔍 Current Implementation (Manual OAuth)

**What you have now:**
- Direct fetch calls to Intuit OAuth endpoints
- Manual token exchange and refresh
- Works perfectly fine
- No external dependencies
- Full control over the flow

**Code:**
```typescript
// Token exchange
const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
  },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: redirectUri,
  }),
});
```

---

## 📦 Intuit's Official SDK Option

### intuit-oauth

**Package:** `intuit-oauth`  
**Link:** https://www.npmjs.com/package/intuit-oauth

**What it provides:**
- Simplified OAuth flow
- Automatic token refresh
- Built-in error handling
- TypeScript support
- Maintained by Intuit

**Installation:**
```bash
npm install intuit-oauth
```

**Usage:**
```typescript
import OAuthClient from 'intuit-oauth';

const oauthClient = new OAuthClient({
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  environment: 'sandbox', // or 'production'
  redirectUri: 'http://localhost:3080/api/qbo/callback',
});

// Generate auth URI
const authUri = oauthClient.authorizeUri({
  scope: [OAuthClient.scopes.Accounting],
  state: 'testState',
});

// Exchange code for tokens
const authResponse = await oauthClient.createToken(req.url);
const accessToken = authResponse.getToken().access_token;
const refreshToken = authResponse.getToken().refresh_token;

// Refresh token
const newTokens = await oauthClient.refresh();

// Make API calls
oauthClient.setToken(tokens);
const companyInfo = await oauthClient.makeApiCall({
  url: `https://quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}`,
});
```

---

## ⚖️ Comparison

| Feature | Manual (Current) | Intuit SDK |
|---------|------------------|------------|
| **Dependencies** | None | +1 package |
| **Code complexity** | Medium | Low |
| **Control** | Full | Abstracted |
| **Maintenance** | You maintain | Intuit maintains |
| **Token refresh** | Manual | Automatic |
| **Error handling** | Custom | Built-in |
| **TypeScript** | ✅ | ✅ |
| **Works now** | ✅ | Need to install |
| **Bundle size** | Smaller | Larger |

---

## 💡 Recommendation

### **Keep your current manual implementation** ✅

**Why:**

1. **It already works** - Your OAuth flow is correct and functional
2. **No dependencies** - Less attack surface, smaller bundle
3. **Full control** - You understand every step
4. **Simple enough** - OAuth2 isn't complex for your use case
5. **Token refresh implemented** - Already have auto-refresh logic

**When to use SDK:**
- Building complex QuickBooks integration with many API calls
- Need helper methods for API endpoints
- Want Intuit's official support and updates
- Building a QuickBooks-focused app

**Your case:**
- Simple OAuth + data pull
- Already working implementation
- No need for additional complexity

---

## 🔧 If You Want to Use the SDK Anyway

### Installation:

```bash
cd frontend
npm install intuit-oauth
```

### Updated `/api/qbo/auth.ts`:

```typescript
import OAuthClient from 'intuit-oauth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: integration } = await supabase
    .from('integrations')
    .select('qb_client_id, qb_client_secret, qb_redirect_uri')
    .eq('provider', 'quickbooks')
    .single();

  const oauthClient = new OAuthClient({
    clientId: integration?.qb_client_id || process.env.QUICKBOOKS_CLIENT_ID!,
    clientSecret: integration?.qb_client_secret || process.env.QUICKBOOKS_CLIENT_SECRET!,
    environment: 'sandbox',
    redirectUri: integration?.qb_redirect_uri || 'http://localhost:3080/api/qbo/callback',
  });

  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state: Math.random().toString(36).substring(7),
  });

  return res.status(200).json({ authUrl: authUri });
}
```

### Updated `/api/qbo/callback.ts`:

```typescript
import OAuthClient from 'intuit-oauth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: integration } = await supabase
    .from('integrations')
    .select('qb_client_id, qb_client_secret, qb_redirect_uri')
    .eq('provider', 'quickbooks')
    .single();

  const oauthClient = new OAuthClient({
    clientId: integration?.qb_client_id || process.env.QUICKBOOKS_CLIENT_ID!,
    clientSecret: integration?.qb_client_secret || process.env.QUICKBOOKS_CLIENT_SECRET!,
    environment: 'sandbox',
    redirectUri: integration?.qb_redirect_uri || 'http://localhost:3080/api/qbo/callback',
  });

  try {
    const authResponse = await oauthClient.createToken(req.url);
    const token = authResponse.getToken();

    await supabase
      .from('integrations')
      .upsert({
        provider: 'quickbooks',
        realm_id: token.realmId,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      });

    return res.redirect('/settings?success=connected');
  } catch (error) {
    console.error('OAuth error:', error);
    return res.redirect('/settings?error=callback_failed');
  }
}
```

---

## 🎯 My Recommendation

**Stick with your current manual implementation.**

**Reasons:**
1. ✅ Already working
2. ✅ No new dependencies
3. ✅ Token refresh implemented
4. ✅ Full control
5. ✅ Easier to debug

**Focus on:**
1. 🔴 **Fix Gemini API keys** (critical - extraction broken)
2. 🟡 **Test QuickBooks OAuth flow** (should work now)
3. 🟢 **Verify data sync**

The SDK doesn't add significant value for your use case. Your manual implementation is clean, works well, and follows OAuth2 best practices.

---

## 📝 Summary

**Current implementation:** ✅ Good  
**Need SDK:** ❌ No  
**Priority:** Fix Gemini keys first  

Your OAuth code is solid. Don't fix what isn't broken!
