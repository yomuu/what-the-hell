# Creates (or updates) a Windows Task Scheduler task that runs the Cyber Bunker weekly content
# workflow every Sunday at 7pm. Run it once from PowerShell in the project folder:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\register-weekly-task.ps1
# Add -RunNow to start a test run straight away.
param([switch]$RunNow)

$TaskName = "Cyber Bunker weekly content"
$Project  = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Runner   = Join-Path $PSScriptRoot "run-weekly-content.ps1"

$Action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Runner`"" `
  -WorkingDirectory $Project

$Trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At "7:00 PM"

# Runs as you, only while you're logged on, so it uses your existing Claude Code login and no password is stored.
# StartWhenAvailable runs it later if the PC was off or asleep at 7pm. It stops after 2 hours if something hangs.
$Principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$Settings  = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings `
  -Description "Runs /weekly-content with Claude Code in headless mode. Logs: $Project\content\logs" -Force | Out-Null

$task = Get-ScheduledTask -TaskName $TaskName
Write-Output "Registered '$TaskName'. Next run: $((Get-ScheduledTaskInfo -TaskName $TaskName).NextRunTime)"
Write-Output "Logs will appear in $Project\content\logs"

if ($RunNow) {
  Start-ScheduledTask -TaskName $TaskName
  Write-Output "Test run started. It takes a while (often 10 to 30 minutes). Check progress with:"
  Write-Output "  Get-ScheduledTaskInfo -TaskName '$TaskName' | Select-Object LastRunTime, LastTaskResult"
}
