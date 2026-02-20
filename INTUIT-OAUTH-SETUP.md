# Intuit QuickBooks OAuth Setup Guide

## 📋 Quick Reference for Intuit App Configuration

Based on your screenshot, here are the exact values you need to provide to Intuit:

---

## 🔧 Development Environment

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

## 🚀 Production Environment (Railway)

### Step 1: Get Your Railway URL
After deploying to Railway, you'll get a URL like:
```
https://your-app-name.up.railway.app
```

### Step 2: Configure Intuit App

#### Host Name
```
your-app-name.up.railway.app
```

#### Launch URL
```
https://your-app-name.up.railway.app/settings/integrations
```

#### Disconnect URL
```
https://your-app-name.up.railway.app/api/qbo/disconnect
```

#### Redirect URI (OAuth callback)
```
https://your-app-name.up.railway.app/api/qbo/callback
```

---

## 📝 Notes

1. **Multiple Environments**: You can add both development and production URLs in the Intuit app settings
2. **HTTPS Required**: Production must use HTTPS (Railway provides this automatically)
3. **Exact Match**: The redirect URI must match exactly what you configure in Intuit
4. **No Trailing Slash**: Don't add trailing slashes to the URLs

---

## 🔐 After Creating the App

You'll receive:
- **Client ID**
- **Client Secret**

Store these securely in your environment variables:

```env
# .env or .env.local
INTUIT_CLIENT_ID=your_client_id
INTUIT_CLIENT_SECRET=your_client_secret
INTUIT_REDIRECT_URI=http://localhost:3080/api/qbo/callback
```

---

## ✅ Testing the Integration

1. Navigate to `/settings/integrations`
2. Click "Connect to QuickBooks"
3. You'll be redirected to Intuit's OAuth page
4. Authorize the app
5. You'll be redirected back to your app
6. Connection status should show "Connected"

---

## 🐛 Troubleshooting

### Error: "Redirect URI mismatch"
- Verify the URI in Intuit matches exactly
- Check for trailing slashes
- Ensure protocol (http/https) matches

### Error: "Invalid client credentials"
- Check your Client ID and Secret
- Verify they're in the correct environment variables
- Restart your server after changing .env

### Error: "Connection failed"
- Check your internet connection
- Verify Intuit API is not down
- Check server logs for detailed error messages
