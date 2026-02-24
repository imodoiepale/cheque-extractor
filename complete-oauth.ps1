Write-Host "`n=== COMPLETING QUICKBOOKS OAUTH ===" -ForegroundColor Cyan

$authCode = "XAB11771880343QWB12zjzXa4X1vXJVwfssILy3vwi12R55zSu"
$realmId = "9341456444565561"
$clientId = "ABT11UEvWZetoyA6wIAVI6fTc3PmCGod6B8IcDGRzCZ6nX2JBM"
$clientSecret = "cCLwyIiP4bTMB4e6joY5YP5MMqz3CJyj9mciuhuO"
$redirectUri = "http://localhost:3080/api/qbo/callback"

Write-Host "`n1. Exchanging authorization code for tokens..." -ForegroundColor Yellow

$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${clientId}:${clientSecret}"))

$body = @{
    grant_type = "authorization_code"
    code = $authCode
    redirect_uri = $redirectUri
}

try {
    $tokenResponse = Invoke-RestMethod -Uri "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer" `
        -Method POST `
        -Headers @{
            "Accept" = "application/json"
            "Content-Type" = "application/x-www-form-urlencoded"
            "Authorization" = "Basic $auth"
        } `
        -Body $body

    Write-Host "   ✅ Tokens received!" -ForegroundColor Green
    Write-Host "   - Access Token: $($tokenResponse.access_token.Substring(0, 20))..." -ForegroundColor White
    Write-Host "   - Refresh Token: $($tokenResponse.refresh_token.Substring(0, 20))..." -ForegroundColor White
    Write-Host "   - Expires in: $($tokenResponse.expires_in) seconds" -ForegroundColor White

    Write-Host "`n2. Storing tokens in Supabase..." -ForegroundColor Yellow

    $expiresAt = (Get-Date).AddSeconds($tokenResponse.expires_in).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    $updatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

    $supabaseData = @{
        provider = "quickbooks"
        realm_id = $realmId
        company_id = $realmId
        access_token = $tokenResponse.access_token
        refresh_token = $tokenResponse.refresh_token
        expires_at = $expiresAt
        updated_at = $updatedAt
        qb_client_id = $clientId
        qb_client_secret = $clientSecret
        qb_redirect_uri = $redirectUri
    } | ConvertTo-Json

    $headers = @{
        "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxYm16ZXJkYWdxZXZqZHdobHdoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTYyMDY2MSwiZXhwIjoyMDg1MTk2NjYxfQ.6_bq1jeF0CEY7cB9qC60pONLeYhThmPKmJWUrb0C1No"
        "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxYm16ZXJkYWdxZXZqZHdobHdoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTYyMDY2MSwiZXhwIjoyMDg1MTk2NjYxfQ.6_bq1jeF0CEY7cB9qC60pONLeYhThmPKmJWUrb0C1No"
        "Content-Type" = "application/json"
        "Prefer" = "resolution=merge-duplicates"
    }

    $supabaseResponse = Invoke-RestMethod -Uri "https://yqbmzerdagqevjdwhlwh.supabase.co/rest/v1/integrations?provider=eq.quickbooks" `
        -Method PATCH `
        -Headers $headers `
        -Body $supabaseData

    Write-Host "   ✅ Tokens stored in database!" -ForegroundColor Green

    Write-Host "`n3. Verifying connection..." -ForegroundColor Yellow
    
    # Wait a moment for database to update
    Start-Sleep -Seconds 2
    
    $verification = Invoke-RestMethod -Uri "https://yqbmzerdagqevjdwhlwh.supabase.co/rest/v1/integrations?provider=eq.quickbooks&select=*" -Headers @{
        "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxYm16ZXJkYWdxZXZqZHdobHdoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTYyMDY2MSwiZXhwIjoyMDg1MTk2NjYxfQ.6_bq1jeF0CEY7cB9qC60pONLeYhThmPKmJWUrb0C1No"
        "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxYm16ZXJkYWdxZXZqZHdobHdoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTYyMDY2MSwiZXhwIjoyMDg1MTk2NjYxfQ.6_bq1jeF0CEY7cB9qC60pONLeYhThmPKmJWUrb0C1No"
    }

    if ($verification[0].access_token) {
        Write-Host "   ✅ Connection verified!" -ForegroundColor Green
        Write-Host "   - Realm ID: $($verification[0].realm_id)" -ForegroundColor White
        Write-Host "   - Company ID: $($verification[0].company_id)" -ForegroundColor White
        Write-Host "   - Token expires: $($verification[0].expires_at)" -ForegroundColor White
    }

    Write-Host "`n🎉 SUCCESS! QuickBooks is now connected!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Go to http://localhost:3080/qb-comparisons" -ForegroundColor White
    Write-Host "2. Click 'Sync from QuickBooks' to pull data" -ForegroundColor White
    Write-Host "3. Or run: Invoke-RestMethod -Uri 'http://localhost:3080/api/qbo/pull-checks' -Method POST -ContentType 'application/json' -Body '{\"store\":true}'" -ForegroundColor Gray

} catch {
    Write-Host "   ❌ Error: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Details:" -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor Gray
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody" -ForegroundColor Gray
    }
}

Write-Host ""
