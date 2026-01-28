# PowerShell script to setup Supabase database
# Run all migrations in order

Write-Host "🚀 Setting up OCR Check Processing database..." -ForegroundColor Cyan
Write-Host ""

# Supabase project details
$SUPABASE_URL = "https://yqbmzerdagqevjdwhlwh.supabase.co"
$SUPABASE_SERVICE_KEY = $env:SUPABASE_SERVICE_ROLE_KEY

if (-not $SUPABASE_SERVICE_KEY) {
    Write-Host "❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable not set" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please set it first:" -ForegroundColor Yellow
    Write-Host '$env:SUPABASE_SERVICE_ROLE_KEY = "your-service-role-key"' -ForegroundColor Gray
    exit 1
}

# Migration files in order
$migrations = @(
    "20260101000000_enable_extensions.sql",
    "20260101000001_create_tenants.sql",
    "20260101000002_create_checks.sql",
    "20260101000003_create_processing_stages.sql",
    "20260101000004_create_audit_logs.sql",
    "20260101000005_create_export_history.sql",
    "20260101000006_create_qbo_connections.sql",
    "20260101000007_create_user_profiles.sql",
    "20260101000008_create_analytics_views.sql",
    "20260101000009_create_indexes.sql",
    "20260101000010_add_rls_policies.sql",
    "20260101000011_create_functions.sql",
    "20260101000012_create_triggers.sql",
    "20240123000002_storage_buckets.sql"
)

$migrationsPath = "supabase\migrations"
$successCount = 0
$errorCount = 0

foreach ($migration in $migrations) {
    $filePath = Join-Path $migrationsPath $migration
    
    if (-not (Test-Path $filePath)) {
        Write-Host "⚠️  Skipping $migration (file not found)" -ForegroundColor Yellow
        continue
    }
    
    Write-Host "📝 Running: $migration" -ForegroundColor White
    
    try {
        # Read SQL file
        $sql = Get-Content $filePath -Raw
        
        # Execute SQL via Supabase REST API
        $headers = @{
            "apikey" = $SUPABASE_SERVICE_KEY
            "Authorization" = "Bearer $SUPABASE_SERVICE_KEY"
            "Content-Type" = "application/json"
        }
        
        $body = @{
            "query" = $sql
        } | ConvertTo-Json
        
        $response = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/rpc/exec_sql" -Method Post -Headers $headers -Body $body -ErrorAction Stop
        
        Write-Host "   ✅ Success" -ForegroundColor Green
        $successCount++
    }
    catch {
        Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
        $errorCount++
        
        # Ask if user wants to continue
        $continue = Read-Host "   Continue with remaining migrations? (Y/n)"
        if ($continue -eq "n" -or $continue -eq "N") {
            break
        }
    }
    
    Write-Host ""
}

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""
Write-Host "📊 Summary:" -ForegroundColor Cyan
Write-Host "   ✅ Successful: $successCount" -ForegroundColor Green
Write-Host "   ❌ Failed: $errorCount" -ForegroundColor Red
Write-Host ""

if ($errorCount -eq 0) {
    Write-Host "🎉 Database setup complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Verify tables in Supabase Dashboard" -ForegroundColor Gray
    Write-Host "2. Check Storage bucket 'check-images' exists" -ForegroundColor Gray
    Write-Host "3. Test the application" -ForegroundColor Gray
} else {
    Write-Host "⚠️  Some migrations failed. Check errors above." -ForegroundColor Yellow
    Write-Host "You may need to run failed migrations manually in Supabase SQL Editor." -ForegroundColor Gray
}

Write-Host ""
