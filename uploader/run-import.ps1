# PowerShell script untuk import CSV

param(
    [string]$Step = ""
)

# Change to script directory
Set-Location $PSScriptRoot

$nodePath = "C:\Program Files\nodejs\node.exe"

if (-not (Test-Path $nodePath)) {
    Write-Host "❌ Node.js tidak ditemukan di: $nodePath" -ForegroundColor Red
    Write-Host "Silakan install Node.js atau update path di script ini" -ForegroundColor Yellow
    exit 1
}

if ($Step -eq "") {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Import CSV to Supabase - Step by Step" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage: .\run-import.ps1 [step_number|all]" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Yellow
    Write-Host "  .\run-import.ps1        # Show list of steps"
    Write-Host "  .\run-import.ps1 1      # Import step 1 (zones)"
    Write-Host "  .\run-import.ps1 all    # Import all steps"
    Write-Host ""
    & $nodePath import-csv.js
} else {
    Write-Host ""
    Write-Host "🚀 Running step: $Step" -ForegroundColor Green
    Write-Host ""
    & $nodePath import-csv.js $Step
}


