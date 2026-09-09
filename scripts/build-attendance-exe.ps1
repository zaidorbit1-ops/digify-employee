$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $appRoot "dist"
$exe = Join-Path $dist "attendance-worker.exe"

Push-Location $appRoot
try {
  New-Item -ItemType Directory -Force -Path $dist | Out-Null
  & npx pkg scripts/attendance-worker.cjs --targets host --output $exe
  if ($LASTEXITCODE -ne 0) { throw "Executable packaging failed with exit code $LASTEXITCODE." }
  Copy-Item (Join-Path $appRoot ".env.example") (Join-Path $dist ".env.example") -Force
  $distScripts = Join-Path $dist "scripts"
  New-Item -ItemType Directory -Force -Path $distScripts | Out-Null
  Copy-Item (Join-Path $PSScriptRoot "install-attendance-task.ps1") (Join-Path $distScripts "install-attendance-task.ps1") -Force
  Copy-Item (Join-Path $PSScriptRoot "uninstall-attendance-task.ps1") (Join-Path $distScripts "uninstall-attendance-task.ps1") -Force
  Write-Host "Created $exe"
  Write-Host "Copy dist\\.env.example to dist\\.env and add the real values before installing the task."
} finally {
  Pop-Location
}