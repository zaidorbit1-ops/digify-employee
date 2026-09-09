$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $PSScriptRoot
$batPath = Join-Path $PSScriptRoot "start-office-sync.bat"
$taskName = "ZKTecoAttendanceSync"

if (-not (Test-Path $batPath)) {
  throw "Missing $batPath"
}

$action = New-ScheduledTaskAction -Execute $batPath -WorkingDirectory $appRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "Installed Windows task '$taskName'."
Write-Host "After this PC is turned on and you log in, attendance sync will start by itself."
Write-Host "Test now with: schtasks /Run /TN $taskName"
