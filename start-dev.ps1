$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host "Starting AnythingLLM development services..." -ForegroundColor Cyan
Write-Host ""
Write-Host "Frontend:  http://localhost:3000"
Write-Host "Server:    http://localhost:3001"
Write-Host "Collector: http://localhost:8888"
Write-Host ""

Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot\server'; yarn dev" -WindowStyle Normal
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot\frontend'; yarn dev" -WindowStyle Normal
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot\collector'; yarn dev" -WindowStyle Normal

Write-Host "Three service windows were opened."
Write-Host "You can close this launcher window now."
