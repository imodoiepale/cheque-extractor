# Simple PowerShell script to run Supabase migrations
# Usage: .\scripts\run-migrations.ps1

Write-Host "Setting up Supabase database..." -ForegroundColor Cyan
Write-Host ""

$SUPABASE_URL = "https://yqbmzerdagqevjdwhlwh.supabase.co"
$SERVICE_KEY = $env:SUPABASE_SERVICE_ROLE_KEY

if (-not $SERVICE_KEY) {
    Write-Host "ERROR: SUPABASE_SERVICE_ROLE_KEY not set" -ForegroundColor Red
    Write-Host 'Run: $env:SUPABASE_SERVICE_ROLE_KEY = "your-key"' -ForegroundColor Yellow
    exit 1
}

$migrations = @(
    "20260101000000_enable_extensions.sql"
    "20260101000001_create_tenants.sql"
    "20260101000002_create_checks.sql"
    "20260101000003_create_processing_stages.sql"
    "20260101000004_create_audit_logs.sql"
    "20260101000005_create_export_history.sql"
    "20260101000006_create_qbo_connections.sql"
    "20260101000007_create_user_profiles.sql"
    "20260101000008_create_analytics_views.sql"
    "20260101000009_create_indexes.sql"
    "20260101000010_add_rls_policies.sql"
    "20260101000011_create_functions.sql"
    "20260101000012_create_triggers.sql"
    "20240123000002_storage_buckets.sql"
)

$success = 0
$failed = 0

foreach ($file in $migrations) {
    $path = "supabase\migrations\$file"
    
    if (-not (Test-Path $path)) {
        Write-Host "SKIP: $file (not found)" -ForegroundColor Yellow
        continue
    }
    
    Write-Host "Running: $file" -ForegroundColor White
    
    try {
        $sql = Get-Content $path -Raw -Encoding UTF8
        
        $headers = @{
            "apikey" = $SERVICE_KEY
            "Authorization" = "Bearer $SERVICE_KEY"
            "Content-Type" = "text/plain"
        }
        
        $response = Invoke-WebRequest -Uri "$SUPABASE_URL/rest/v1/rpc/exec_sql" -Method Post -Headers $headers -Body $sql -ErrorAction Stop
        
        Write-Host "  SUCCESS" -ForegroundColor Green
        $success++
    }
    catch {
        Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
        $failed++
        
        $answer = Read-Host "  Continue? (Y/n)"
        if ($answer -eq "n") {
            break
        }
    }
    
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Gray
Write-Host "Summary: $success succeeded, $failed failed" -ForegroundColor Cyan
Write-Host ""

if ($failed -eq 0) {
    Write-Host "Database setup complete!" -ForegroundColor Green
}
else {
    Write-Host "Some migrations failed - check Supabase dashboard" -ForegroundColor Yellow
}
