# Start ngrok tunnel for local API (port 8000) - used for VAPI voice callbacks.
# Usage: .\scripts\ngrok-tunnel.ps1
# Then set apps/api/.env: VAPI_CALLBACK_BASE_URL=https://<ngrok-url>

$port = 8000
$ngrok = $null

# 1. Try PATH
if (Get-Command ngrok -ErrorAction SilentlyContinue) {
    $ngrok = "ngrok"
}

# 2. Try common install locations
if (-not $ngrok) {
    $paths = @(
        "$env:ProgramFiles\Ngrok\ngrok.exe",
        "${env:ProgramFiles(x86)}\Ngrok\ngrok.exe",
        "$env:LOCALAPPDATA\Microsoft\WinGet\Links\ngrok.exe",
        "$PSScriptRoot\ngrok\ngrok.exe"
    )
    # WinGet packages (folder names vary by version)
    $wingetPackages = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages"
    if (Test-Path $wingetPackages) {
        $found = Get-ChildItem -Path $wingetPackages -Filter "ngrok.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
        if ($found) { $paths = @($found) + $paths }
    }
    foreach ($p in $paths) {
        if (Test-Path $p) { $ngrok = $p; break }
    }
}

# 3. Download latest ngrok to scripts/ngrok/ if still not found
if (-not $ngrok) {
    $ngrokDir = Join-Path $PSScriptRoot "ngrok"
    $ngrokExe = Join-Path $ngrokDir "ngrok.exe"
    $zipUrl = "https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip"

    if (-not (Test-Path $ngrokExe)) {
        Write-Host "Downloading latest ngrok to $ngrokDir ..." -ForegroundColor Yellow
        New-Item -ItemType Directory -Force -Path $ngrokDir | Out-Null
        $zipPath = Join-Path $env:TEMP "ngrok-windows.zip"
        try {
            Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
            Expand-Archive -Path $zipPath -DestinationPath $ngrokDir -Force
            Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
        } catch {
            Write-Host "Download failed: $_" -ForegroundColor Red
            Write-Host "Install manually from: https://ngrok.com/download" -ForegroundColor Yellow
            exit 1
        }
    }
    if (Test-Path $ngrokExe) { $ngrok = $ngrokExe }
}

if (-not $ngrok) {
    Write-Host "ngrok not found. Install from: https://ngrok.com/download" -ForegroundColor Yellow
    exit 1
}

Write-Host "Starting ngrok tunnel to http://localhost:$port ..." -ForegroundColor Green
Write-Host "Set apps/api/.env: VAPI_CALLBACK_BASE_URL=<the https URL ngrok shows>" -ForegroundColor Cyan
& $ngrok http $port
