$ErrorActionPreference = "Stop"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
	throw "Run this installer from PowerShell as Administrator. Windows requires elevation to register the SYSTEM attendance task."
}

$appRoot = Split-Path -Parent $PSScriptRoot
$dist = if (Test-Path (Join-Path $appRoot "attendance-worker.exe")) {
	$appRoot
} else {
	Join-Path $appRoot "dist"
}
$exePath = Join-Path $dist "attendance-worker.exe"
$taskName = "ZKTecoAttendanceConnector"

if (-not (Test-Path $exePath)) { throw "Missing $exePath. Run npm run attendance:build first." }
if (-not (Test-Path (Join-Path $dist ".env"))) { throw "Missing $dist\.env. Copy .env.example and configure it first." }

$oldTaskName = "ZKTecoAttendanceSync"
Unregister-ScheduledTask -TaskName $oldTaskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute $exePath -WorkingDirectory $dist
$trigger = New-ScheduledTaskTrigger -AtStartup -RandomDelay (New-TimeSpan -Seconds 30)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force -ErrorAction Stop | Out-Null
Start-ScheduledTask -TaskName $taskName
$registeredTask = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
Write-Host "Installed and started Windows task '$($registeredTask.TaskName)'."
Write-Host "Logs: $dist\logs\attendance-worker.log"