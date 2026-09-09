$ErrorActionPreference = "Stop"
$taskName = "ZKTecoAttendanceConnector"

Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Removed Windows task '$taskName'."