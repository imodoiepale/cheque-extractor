# QuickBooks Data Diagnostic Script
# Checks what QB data exists and where it came from

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

Write-Host "`n1. Checking integrations table (QB connection status)..." -ForegroundColor Yellow

$integrationsUrl = "$supabaseUrl/rest/v1/integrations?provider=eq.quickbooks&select=*"
$headers = @{
    "apikey" = $supabaseKey
    "Authorization" = "Bearer $supabaseKey"
    "Content-Type" = "application/json"
}

try {
    $integration = Invoke-RestMethod -Uri $integrationsUrl -Headers $headers -Method Get
    
    if ($integration -and $integration.Count -gt 0) {
        $int = $integration[0]
        Write-Host "   ✓ Integration record found" -ForegroundColor Green
        Write-Host "   - Provider: $($int.provider)" -ForegroundColor Gray
        Write-Host "   - Has Access Token: $($null -ne $int.access_token)" -ForegroundColor Gray
        Write-Host "   - Realm ID: $($int.realm_id)" -ForegroundColor Gray
        Write-Host "   - Expires At: $($int.expires_at)" -ForegroundColor Gray
        
        if ($int.access_token) {
            Write-Host "   ✅ QuickBooks is CONNECTED via OAuth" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️  QuickBooks credentials saved but NOT connected (no access token)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "   ⚠️  No integration record found - QuickBooks NOT configured" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Error checking integrations: $_" -ForegroundColor Red
}

Write-Host "`n2. Checking qb_entries table (synced QB data)..." -ForegroundColor Yellow

$entriesUrl = "$supabaseUrl/rest/v1/qb_entries?select=id,qb_type,qb_source,check_number,payee,amount,date,synced_at&order=synced_at.desc&limit=10"

try {
    $entries = Invoke-RestMethod -Uri $entriesUrl -Headers $headers -Method Get
    
    if ($entries -and $entries.Count -gt 0) {
        Write-Host "   ✅ Found $($entries.Count) QB entries (showing latest 10)" -ForegroundColor Green
        Write-Host ""
        Write-Host "   Check# | Payee                    | Amount    | Date       | Source              | Synced At" -ForegroundColor Cyan
        Write-Host "   " + ("-" * 110) -ForegroundColor Gray
        
        foreach ($entry in $entries) {
            $checkNum = if ($entry.check_number) { $entry.check_number.PadRight(6) } else { "N/A   " }
            $payee = if ($entry.payee) { $entry.payee.Substring(0, [Math]::Min(24, $entry.payee.Length)).PadRight(24) } else { "N/A".PadRight(24) }
            $amount = if ($entry.amount) { "`$$($entry.amount)".PadLeft(9) } else { "N/A".PadLeft(9) }
            $date = if ($entry.date) { $entry.date.Substring(0, 10) } else { "N/A       " }
            $source = if ($entry.qb_source) { $entry.qb_source.PadRight(19) } else { "unknown".PadRight(19) }
            $syncedAt = if ($entry.synced_at) { $entry.synced_at.Substring(0, 19) } else { "N/A" }
            
            Write-Host "   $checkNum | $payee | $amount | $date | $source | $syncedAt" -ForegroundColor White
        }
        
        Write-Host ""
        Write-Host "   Source breakdown:" -ForegroundColor Cyan
        $sourceGroups = $entries | Group-Object -Property qb_source
        foreach ($group in $sourceGroups) {
            $sourceName = if ($group.Name) { $group.Name } else { "unknown" }
            Write-Host "   - $sourceName : $($group.Count) entries" -ForegroundColor Gray
        }
        
        # Check if data is from API or file upload
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
        Write-Host "   ⚠️  No QB entries found in database" -ForegroundColor Yellow
        Write-Host "   → Need to either:" -ForegroundColor Gray
        Write-Host "      1. Connect QB and sync via /api/qbo/pull-checks" -ForegroundColor Gray
        Write-Host "      2. Upload a QBO/OFX file via QB Comparisons page" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ❌ Error checking qb_entries: $_" -ForegroundColor Red
}

Write-Host "`n3. Testing QB API endpoints..." -ForegroundColor Yellow

# Test integrations API
Write-Host "   Testing /api/settings/integrations..." -ForegroundColor Gray
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3080/api/settings/integrations" -Method Get -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        $data = $response.Content | ConvertFrom-Json
        Write-Host "   ✓ API responding - QB Connected: $($data.qboConnected), Configured: $($data.qbConfigured)" -ForegroundColor Green
    }
} catch {
    Write-Host "   ⚠️  API not responding (is frontend running?)" -ForegroundColor Yellow
}

# Test entries API
Write-Host "   Testing /api/quickbooks/entries..." -ForegroundColor Gray
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3080/api/quickbooks/entries" -Method Get -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        $data = $response.Content | ConvertFrom-Json
        Write-Host "   ✓ API responding - Entries count: $($data.count)" -ForegroundColor Green
    }
} catch {
    Write-Host "   ⚠️  API not responding (is frontend running?)" -ForegroundColor Yellow
}

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "If QB Online API data is missing:" -ForegroundColor White
Write-Host "1. Verify QuickBooks is connected (Settings → Integrations)" -ForegroundColor Gray
Write-Host "2. Click 'Sync from QuickBooks' button on QB Comparisons page" -ForegroundColor Gray
Write-Host "3. Check browser console for sync errors" -ForegroundColor Gray
Write-Host "4. Verify access token hasn't expired (check expires_at above)" -ForegroundColor Gray
Write-Host ""
