Write-Host "`n=== GEMINI API KEYS DIAGNOSTIC ===" -ForegroundColor Cyan

$keys = @(
    "AIzaSyALrrfFmiZYxVtzpAjgaPz3FB_LkNhFOuo",
    "AIzaSyAqkmLfSmgjcTrXpWiczxNafK9nb6Dt30s"
)

Write-Host "`nTesting $($keys.Count) Gemini API keys..." -ForegroundColor Yellow
Write-Host ""

$validKeys = @()
$invalidKeys = @()

foreach ($key in $keys) {
    $shortKey = $key.Substring(0, 20) + "..."
    Write-Host "Testing key: $shortKey" -NoNewline
    
    try {
        $url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$key"
        $body = @{
            contents = @(
                @{
                    parts = @(
                        @{ text = "Say hello" }
                    )
                }
            )
        } | ConvertTo-Json -Depth 10
        
        $response = Invoke-RestMethod -Uri $url -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop
        
        Write-Host " ✅ VALID" -ForegroundColor Green
        $validKeys += $key
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        $errorMsg = $_.Exception.Message
        
        if ($statusCode -eq 400) {
            Write-Host " ❌ INVALID (400 Bad Request)" -ForegroundColor Red
            Write-Host "   → API key may be disabled, expired, or restricted" -ForegroundColor Yellow
        } elseif ($statusCode -eq 403) {
            Write-Host " ❌ FORBIDDEN (403)" -ForegroundColor Red
            Write-Host "   → API key exists but doesn't have permission" -ForegroundColor Yellow
        } elseif ($statusCode -eq 429) {
            Write-Host " ⚠️  RATE LIMITED (429)" -ForegroundColor Yellow
            Write-Host "   → Key is valid but quota exceeded" -ForegroundColor Yellow
            $validKeys += $key
        } else {
            Write-Host " ❌ ERROR ($statusCode)" -ForegroundColor Red
            Write-Host "   → $errorMsg" -ForegroundColor Gray
        }
        
        $invalidKeys += @{ key = $key; error = $errorMsg; status = $statusCode }
    }
}

Write-Host "`n=== RESULTS ===" -ForegroundColor Cyan
Write-Host "Valid keys: $($validKeys.Count)/$($keys.Count)" -ForegroundColor $(if ($validKeys.Count -gt 0) { 'Green' } else { 'Red' })
Write-Host "Invalid keys: $($invalidKeys.Count)/$($keys.Count)" -ForegroundColor $(if ($invalidKeys.Count -gt 0) { 'Red' } else { 'Green' })

if ($validKeys.Count -eq 0) {
    Write-Host "`n❌ CRITICAL: No valid Gemini API keys found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "SOLUTIONS:" -ForegroundColor Yellow
    Write-Host "1. Generate new API keys at: https://aistudio.google.com/app/apikey" -ForegroundColor White
    Write-Host "2. Make sure to enable 'Gemini API' in your Google Cloud project" -ForegroundColor White
    Write-Host "3. Check if keys have spending limits or restrictions" -ForegroundColor White
    Write-Host "4. Update keys in:" -ForegroundColor White
    Write-Host "   - .env file (GEMINI_API_KEYS)" -ForegroundColor Gray
    Write-Host "   - Settings → Integrations in the app" -ForegroundColor Gray
} else {
    Write-Host "`n✅ Found $($validKeys.Count) working key(s)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Working keys:" -ForegroundColor White
    foreach ($key in $validKeys) {
        Write-Host "  - $($key.Substring(0, 20))..." -ForegroundColor Green
    }
}

Write-Host ""
