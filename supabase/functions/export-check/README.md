# Export Check Edge Function

Exports approved checks to QuickBooks or CSV.

## Usage
```bashcurl -i --location --request POST 'https://your-project.supabase.co/functions/v1/export-check' 
--header 'Authorization: Bearer YOUR_ANON_KEY' 
--header 'Content-Type: application/json' 
--data '{
"tenantId": "tenant-uuid",
"checkIds": ["check-uuid-1", "check-uuid-2"],
"exportType": "qbo_api",
"realmId": "qbo-realm-id"
}'

## Parameters

- `tenantId`: Tenant UUID
- `checkIds`: Array of check UUIDs to export
- `exportType`: `qbo_api` or `csv`
- `realmId`: QuickBooks realm ID (required for qbo_api)

## Response
```json{
"success": true,
"batchId": "batch-uuid",
"exportId": "export-uuid",
"totalChecks": 2,
"successfulCount": 2,
"failedCount": 0
}