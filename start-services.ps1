# PowerShell script to start backend, frontend, and portal services
Write-Host "Starting VIARA services (backend, frontend, portal)..." -ForegroundColor Cyan
node "$PSScriptRoot\start-services.js" $args
