# Supabase Edge Function Deployment Guide

## Prerequisites
- Supabase CLI installed: `npm install -g supabase`
- Supabase project created and migrations run

## Setup

### 1. Login to Supabase CLI
```bash
supabase login
```

### 2. Link Your Project
```bash
cd c:\Users\EPALE\Documents\GitHub\cheque-extractor
supabase link --project-ref yqbmzerdagqevjdwhlwh
```

### 3. Set Environment Variables
The function needs these environment variables set in Supabase Dashboard:

Go to: https://supabase.com/dashboard/project/yqbmzerdagqevjdwhlwh/settings/functions

Add these secrets:
- `BACKEND_URL` = `http://your-backend-url:3090` (or your deployed backend URL)
- `SUPABASE_URL` = (automatically provided)
- `SUPABASE_SERVICE_ROLE_KEY` = (automatically provided)

## Deploy the Function

### Option 1: Deploy via CLI (Recommended)
```bash
# Deploy the export-check function
supabase functions deploy export-check
```

### Option 2: Deploy via Dashboard
1. Go to: https://supabase.com/dashboard/project/yqbmzerdagqevjdwhlwh/functions
2. Click "Create a new function"
3. Name: `export-check`
4. Copy the entire content from `supabase/functions/export-check/index.ts`
5. Paste and click "Deploy"

## Test the Function

### Using curl:
```bash
curl -X POST 'https://yqbmzerdagqevjdwhlwh.supabase.co/functions/v1/export-check' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "tenantId": "YOUR_TENANT_ID",
    "checkIds": ["CHECK_ID_1", "CHECK_ID_2"],
    "exportType": "quickbooks",
    "realmId": "YOUR_QBO_REALM_ID"
  }'
```

### From Frontend:
```typescript
const response = await fetch(
  'https://yqbmzerdagqevjdwhlwh.supabase.co/functions/v1/export-check',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tenantId: user.tenant_id,
      checkIds: selectedCheckIds,
      exportType: 'quickbooks',
      realmId: qboConnection.realm_id,
    }),
  }
);
```

## Function URL
After deployment, your function will be available at:
```
https://yqbmzerdagqevjdwhlwh.supabase.co/functions/v1/export-check
```

## Monitoring

### View Logs:
```bash
supabase functions logs export-check
```

### Or in Dashboard:
https://supabase.com/dashboard/project/yqbmzerdagqevjdwhlwh/logs/functions

## Troubleshooting

### Common Issues:

1. **"Missing Supabase credentials"**
   - Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in function secrets

2. **"Backend export failed"**
   - Check BACKEND_URL environment variable
   - Ensure backend is accessible from Supabase servers
   - Check backend logs for errors

3. **"Failed to create export record"**
   - Verify export_history table exists
   - Check RLS policies allow service role to insert

4. **CORS errors**
   - Function already includes CORS headers
   - Ensure you're sending the Authorization header

## Notes

- The function uses the service role key to bypass RLS
- Export history is tracked in the `export_history` table
- The function calls your backend API at `/api/export`
- Make sure your backend is running and accessible
