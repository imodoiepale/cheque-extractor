# Test QBO file upload
$qboFile = "c:\Users\inkno\Documents\GitHub\cheque-extractor\test-sample.qbo"
$uploadUrl = "http://localhost:3080/api/qbo/upload-file"

Write-Host "Testing QBO file upload..." -ForegroundColor Cyan
Write-Host "File: $qboFile" -ForegroundColor Yellow

if (-not (Test-Path $qboFile)) {
    Write-Host "ERROR: QBO file not found!" -ForegroundColor Red
    exit 1
}

# Read file content
$fileContent = Get-Content $qboFile -Raw
Write-Host "File size: $($fileContent.Length) bytes" -ForegroundColor Green

# Create multipart form data
$boundary = [System.Guid]::NewGuid().ToString()
$LF = "`r`n"

$bodyLines = (
    "--$boundary",
    "Content-Disposition: form-data; name=`"file`"; filename=`"test-sample.qbo`"",
    "Content-Type: application/octet-stream$LF",
    $fileContent,
    "--$boundary--$LF"
) -join $LF

try {
    Write-Host "Uploading to $uploadUrl..." -ForegroundColor Cyan
    
    $response = Invoke-WebRequest -Uri $uploadUrl -Method POST -ContentType "multipart/form-data; boundary=$boundary" -Body $bodyLines -UseBasicParsing
    
    Write-Host "Response Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response Body:" -ForegroundColor Yellow
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
    
} catch {
    Write-Host "ERROR: Upload failed!" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody" -ForegroundColor Yellow
    }
}

Write-Host "`nChecking QB entries after upload..." -ForegroundColor Cyan
try {
    $entries = Invoke-RestMethod -Uri "http://localhost:3080/api/quickbooks/entries" -Method GET
    Write-Host "QB Entries count: $($entries.count)" -ForegroundColor Green
    if ($entries.count -gt 0) {
        Write-Host "Sample entry:" -ForegroundColor Yellow
        $entries.entries[0] | ConvertTo-Json
    }
} catch {
    Write-Host "ERROR: Failed to fetch entries!" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}
