Write-Host "`n=== QUICKBOOKS CONNECTION DIAGNOSTIC ===" -ForegroundColor Cyan

# Check Supabase for QB integration
$headers = @{
    "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxYm16ZXJkYWdxZXZqZHdobHdoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTYyMDY2MSwiZXhwIjoyMDg1MTk2NjYxfQ.6_bq1jeF0CEY7cB9qC60pONLeYhThmPKmJWUrb0C1No"
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxYm16ZXJkYWdxZXZqZHdobHdoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTYyMDY2MSwiZXhwIjoyMDg1MTk2NjYxfQ.6_bq1jeF0CEY7cB9qC60pONLeYhThmPKmJWUrb0C1No"
}

Write-Host "`n1. Checking Supabase integrations table..." -ForegroundColor Yellow
try {
    $integration = Invoke-RestMethod -Uri "https://yqbmzerdagqevjdwhlwh.supabase.co/rest/v1/integrations?provider=eq.quickbooks&select=*" -Headers $headers
    
    if ($integration.Count -eq 0) {
        Write-Host "   ❌ No QuickBooks integration record found" -ForegroundColor Red
        Write-Host "   → You need to save credentials to database first" -ForegroundColor Yellow
    } else {
        $int = $integration[0]
        Write-Host "   ✅ Integration record exists" -ForegroundColor Green
        Write-Host "   - Client ID: $(if ($int.qb_client_id) { '✓ Set' } else { '✗ Missing' })" -ForegroundColor $(if ($int.qb_client_id) { 'Green' } else { 'Red' })
        Write-Host "   - Client Secret: $(if ($int.qb_client_secret) { '✓ Set' } else { '✗ Missing' })" -ForegroundColor $(if ($int.qb_client_secret) { 'Green' } else { 'Red' })
        Write-Host "   - Access Token: $(if ($int.access_token) { '✓ Connected' } else { '✗ Not Connected' })" -ForegroundColor $(if ($int.access_token) { 'Green' } else { 'Red' })
        Write-Host "   - Realm ID: $(if ($int.realm_id) { $int.realm_id } else { 'Not set' })" -ForegroundColor White
        
        if ($int.access_token) {
            Write-Host "`n   🎉 QuickBooks IS connected!" -ForegroundColor Green
            Write-Host "   Company ID: $($int.realm_id)" -ForegroundColor White
        } else {
            Write-Host "`n   ⚠️  Credentials saved but OAuth not completed" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "   ❌ Error checking Supabase: $_" -ForegroundColor Red
}

Write-Host "`n2. Checking frontend API status..." -ForegroundColor Yellow
try {
    $apiStatus = Invoke-RestMethod -Uri "http://localhost:3080/api/settings/integrations"
    Write-Host "   - QB Configured: $($apiStatus.qbConfigured)" -ForegroundColor $(if ($apiStatus.qbConfigured) { 'Green' } else { 'Red' })
    Write-Host "   - QB Connected: $($apiStatus.qboConnected)" -ForegroundColor $(if ($apiStatus.qboConnected) { 'Green' } else { 'Red' })
    Write-Host "   - Client ID: $($apiStatus.qbClientId)" -ForegroundColor White
} catch {
    Write-Host "   ❌ Frontend not responding: $_" -ForegroundColor Red
}

Write-Host "`n3. Checking QB entries in database..." -ForegroundColor Yellow
try {
    $entries = Invoke-RestMethod -Uri "https://yqbmzerdagqevjdwhlwh.supabase.co/rest/v1/qb_entries?select=count" -Method HEAD -Headers $headers
    $count = if ($entries.PSObject.Properties['Content-Range']) {
        $range = $entries.'Content-Range'
        if ($range -match '/(\d+)$') { $matches[1] } else { "0" }
    } else { "0" }
    Write-Host "   QB Entries: $count" -ForegroundColor $(if ([int]$count -gt 0) { 'Green' } else { 'Yellow' })
} catch {
    Write-Host "   QB Entries: 0" -ForegroundColor Yellow
}

Write-Host "`n=== DIAGNOSIS ===" -ForegroundColor Cyan
Write-Host ""

if ($integration.Count -eq 0) {
    Write-Host "❌ PROBLEM: No integration record in database" -ForegroundColor Red
    Write-Host ""
    Write-Host "FIX:" -ForegroundColor Yellow
    Write-Host "1. Go to http://localhost:3080/settings" -ForegroundColor White
    Write-Host "2. Click 'Integrations' tab" -ForegroundColor White
    Write-Host "3. Click 'Configure Credentials' button" -ForegroundColor White
    Write-Host "4. Enter your QB credentials and save" -ForegroundColor White
} elseif (-not $integration[0].access_token) {
    Write-Host "⚠️  PROBLEM: Credentials saved but OAuth not completed" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "FIX:" -ForegroundColor Yellow
    Write-Host "1. Go to http://localhost:3080/settings" -ForegroundColor White
    Write-Host "2. Click 'Integrations' tab" -ForegroundColor White
    Write-Host "3. Click 'Connect to QuickBooks' button (green)" -ForegroundColor White
    Write-Host "4. Authorize in the Intuit popup window" -ForegroundColor White
    Write-Host "5. You'll be redirected back with access token" -ForegroundColor White
} else {
    Write-Host "✅ QuickBooks is properly connected!" -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now:" -ForegroundColor White
    Write-Host "- Sync data from QB: Go to QB Comparisons page and click 'Sync from QuickBooks'" -ForegroundColor White
    Write-Host "- Or use: POST http://localhost:3080/api/qbo/pull-checks" -ForegroundColor White
}

Write-Host ""
