# ngrok-tunnel.ps1
# Expose local FastAPI (port 8000) via ngrok for mobile/Vapi testing

Write-Host "Starting ngrok tunnel for CONXA API (port 8000)..." -ForegroundColor Cyan
Write-Host ""

# Resolve ngrok executable (PATH first, then common local locations)
$ngrokExe = $null
$ngrokCmd = Get-Command ngrok -ErrorAction SilentlyContinue
if ($ngrokCmd -and $ngrokCmd.Source) {
    $ngrokExe = $ngrokCmd.Source
}

if (-not $ngrokExe) {
    $candidates = @(
        "$env:USERPROFILE\ngrok.exe",
        "$env:LOCALAPPDATA\ngrok\ngrok.exe",
        "$env:LOCALAPPDATA\Programs\ngrok\ngrok.exe",
        "$env:ProgramData\chocolatey\bin\ngrok.exe",
        "$env:ProgramFiles\ngrok\ngrok.exe",
        "${env:ProgramFiles(x86)}\ngrok\ngrok.exe"
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            $ngrokExe = $candidate
            break
        }
    }
}

if (-not $ngrokExe) {
    Write-Host "Error: ngrok not found." -ForegroundColor Red
    Write-Host "Install from: https://ngrok.com/download" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Quick install (Windows with Chocolatey):" -ForegroundColor Yellow
    Write-Host "  choco install ngrok" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Or download directly from https://ngrok.com/download" -ForegroundColor Yellow
    exit 1
}

# Check if backend is running on port 8000
Write-Host "Checking if backend is running on port 8000..." -ForegroundColor Cyan
$backendRunning = Test-NetConnection -ComputerName localhost -Port 8000 -InformationLevel Quiet -WarningAction SilentlyContinue

if (-not $backendRunning) {
    Write-Host "Warning: Backend not detected on port 8000!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Make sure to start the backend first:" -ForegroundColor Yellow
    Write-Host "  cd apps/api" -ForegroundColor Gray
    Write-Host "  uvicorn src.main:app --reload" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Press Ctrl+C to cancel, or wait to start ngrok anyway..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
} else {
    Write-Host "Backend is running!" -ForegroundColor Green
    Write-Host ""
}

# Display usage instructions
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  ngrok tunnel will create a public HTTPS URL              ║" -ForegroundColor Cyan
Write-Host "║  like: https://abc123.ngrok.io                            ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "After tunnel starts:" -ForegroundColor Yellow
Write-Host "1. Copy the HTTPS URL from ngrok output" -ForegroundColor White
Write-Host "2. Update apps/web/.env.local:" -ForegroundColor White
Write-Host "   NEXT_PUBLIC_API_BASE_URL=https://abc123.ngrok.io" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Update apps/api/.env CORS_ORIGINS:" -ForegroundColor White
Write-Host "   CORS_ORIGINS=http://localhost:3000,https://abc123.ngrok.io" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Restart both frontend and backend" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C to stop the tunnel" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Start ngrok tunnel
& $ngrokExe http 8000
