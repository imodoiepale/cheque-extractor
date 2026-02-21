# QuickBooks Online Integration Setup Guide

## Prerequisites
- QuickBooks Online account
- Intuit Developer account

## Step 1: Create QuickBooks App

1. Go to https://developer.intuit.com
2. Sign in with your Intuit account
3. Click **"My Apps"** → **"Create an app"**
4. Select **"QuickBooks Online and Payments"**
5. Fill in app details:
   - **App Name**: Cheque Extractor
   - **Description**: Check extraction and comparison tool
6. Click **"Create app"**

## Step 2: Get Your Credentials

After creating the app:

1. Go to **"Keys & credentials"** tab
2. Copy your credentials:
   - **Client ID** (starts with `AB...`)
   - **Client Secret** (keep this secure!)

## Step 3: Configure Redirect URI

1. In the **"Keys & credentials"** tab
2. Scroll to **"Redirect URIs"**
3. Add your redirect URI:
   - **Development**: `http://localhost:3000/api/qbo/callback`
   - **Production**: `https://yourdomain.com/api/qbo/callback`
4. Click **"Save"**

## Step 4: Add Environment Variables

Add these to your `.env.local` file:

```env
# QuickBooks OAuth Credentials
QUICKBOOKS_CLIENT_ID=your_client_id_here
QUICKBOOKS_CLIENT_SECRET=your_client_secret_here
QUICKBOOKS_REDIRECT_URI=http://localhost:3000/api/qbo/callback

# For production, use your domain:
# QUICKBOOKS_REDIRECT_URI=https://yourdomain.com/api/qbo/callback
```

## Step 5: Create Database Table

Run this SQL in your Supabase SQL Editor:

```sql
-- Create integrations table
CREATE TABLE IF NOT EXISTS integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  realm_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider)
);

-- Enable RLS
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

-- Create policy for service role
CREATE POLICY "Service role can manage integrations"
  ON integrations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

## Step 6: Test Connection

1. Start your development server: `npm run dev`
2. Go to http://localhost:3000/settings
3. Click **"Integrations"** tab
4. Click **"Connect to QuickBooks"**
5. Sign in with your QuickBooks account
6. Authorize the app
7. You should be redirected back with success message

## Step 7: Verify Connection

After successful connection, you should see:
- ✅ **Connected** status in Settings → Integrations
- Your QuickBooks company name
- Ability to import/export data

## Troubleshooting

### "QuickBooks not configured" error
- Check that `QUICKBOOKS_CLIENT_ID` is set in `.env.local`
- Restart your dev server after adding env variables

### "Token exchange failed" error
- Verify `QUICKBOOKS_CLIENT_SECRET` is correct
- Check that redirect URI matches exactly

### "Storage failed" error
- Ensure the `integrations` table exists in Supabase
- Check that `SUPABASE_SERVICE_ROLE_KEY` is set

### Connection works but data not importing
- Check QuickBooks API permissions
- Verify your app has "Accounting" scope enabled

## API Scopes Required

Your QuickBooks app needs these scopes:
- `com.intuit.quickbooks.accounting` - Read/write accounting data

## Rate Limits

QuickBooks API has rate limits:
- **Sandbox**: 100 requests/minute
- **Production**: 500 requests/minute per company

## Security Notes

⚠️ **Never commit your credentials to git!**
- Keep `.env.local` in `.gitignore`
- Use environment variables in production
- Rotate credentials if exposed

## Support

For QuickBooks API issues:
- Documentation: https://developer.intuit.com/app/developer/qbo/docs/get-started
- Community: https://help.developer.intuit.com/s/
- Support: https://developer.intuit.com/app/developer/qbo/docs/support
