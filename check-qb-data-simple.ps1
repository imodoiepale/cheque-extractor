# QuickBooks Data Diagnostic Script - Simple Version
Write-Host "`n=== QuickBooks Data Diagnostic ===" -ForegroundColor Cyan

# Load environment variables
$envFile = ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
}

$supabaseUrl = $env:NEXT_PUBLIC_SUPABASE_URL
$supabaseKey = $env:SUPABASE_SERVICE_ROLE_KEY

if (-not $supabaseUrl -or -not $supabaseKey) {
    Write-Host "❌ Missing Supabase credentials in .env" -ForegroundColor Red
    exit 1
}

Write-Host "`n1. Checking QB connection status..." -ForegroundColor Yellow

$integrationsUrl = "$supabaseUrl/rest/v1/integrations?provider=eq.quickbooks"
$headers = @{
    "apikey" = $supabaseKey
    "Authorization" = "Bearer $supabaseKey"
}

try {
    $integration = Invoke-RestMethod -Uri $integrationsUrl -Headers $headers -Method Get
    
    if ($integration -and $integration.Count -gt 0) {
        $int = $integration[0]
        Write-Host "   ✓ Integration record found" -ForegroundColor Green
        Write-Host "   - Has Access Token: $($null -ne $int.access_token)" -ForegroundColor Gray
        Write-Host "   - Realm ID: $($int.realm_id)" -ForegroundColor Gray
        
        if ($int.access_token) {
            Write-Host "   ✅ QuickBooks is CONNECTED" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️  QuickBooks NOT connected (no access token)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "   ⚠️  No integration record - QuickBooks NOT configured" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Error: $_" -ForegroundColor Red
}

Write-Host "`n2. Checking qb_entries table..." -ForegroundColor Yellow

$entriesUrl = "$supabaseUrl/rest/v1/qb_entries?select=qb_source&limit=1000"

try {
    $entries = Invoke-RestMethod -Uri $entriesUrl -Headers $headers -Method Get
    
    if ($entries -and $entries.Count -gt 0) {
        Write-Host "   ✅ Found $($entries.Count) QB entries" -ForegroundColor Green
        
        # Count by source
        $sourceGroups = $entries | Group-Object -Property qb_source
        Write-Host "`n   Source breakdown:" -ForegroundColor Cyan
        foreach ($group in $sourceGroups) {
            $sourceName = if ($group.Name) { $group.Name } else { "unknown" }
            Write-Host "   - $($sourceName): $($group.Count) entries" -ForegroundColor White
        }
        
        # Check if data is from API or file
        $apiSources = @('cheque_written', 'bill_paid_by_cheque', 'cheque_received')
        $fileSources = @('qbo_file_upload', 'FileImport', 'default')
        
        $apiCount = ($entries | Where-Object { $apiSources -contains $_.qb_source }).Count
        $fileCount = ($entries | Where-Object { $fileSources -contains $_.qb_source }).Count
        
        Write-Host ""
        if ($apiCount -gt 0) {
            Write-Host "   ✅ $apiCount entries from QuickBooks Online API" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️  0 entries from QuickBooks Online API" -ForegroundColor Yellow
        }
        
        if ($fileCount -gt 0) {
            Write-Host "   ✅ $fileCount entries from File Upload" -ForegroundColor Green
        } else {
            Write-Host "   ℹ️  0 entries from File Upload" -ForegroundColor Gray
        }
        
    } else {
        Write-Host "   ⚠️  No QB entries found" -ForegroundColor Yellow
        Write-Host "   → Connect QB and click 'Sync from QuickBooks' button" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ❌ Error: $_" -ForegroundColor Red
}

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "To get QB Online API data:" -ForegroundColor White
Write-Host "1. Settings → Integrations → Connect QuickBooks" -ForegroundColor Gray
Write-Host "2. QB Comparisons → Click 'Sync from QuickBooks' button" -ForegroundColor Gray
Write-Host "3. Data will show with 'QB API' badge in Source column" -ForegroundColor Gray
Write-Host ""
