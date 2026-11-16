# Runs the /weekly-content workflow with Claude Code in headless mode and logs the result.
# Task Scheduler calls this every Sunday at 7pm (see register-weekly-task.ps1). You can also run it by hand:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\cyber-reels\tools\run-weekly-content.ps1

$ErrorActionPreference = "Stop"
$Project = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path   # the repo root (contains .claude and cyber-reels)
$LogDir  = Join-Path $Project "cyber-reels\content\logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Stamp   = Get-Date -Format "yyyy-MM-dd_HHmm"
$JsonLog = Join-Path $LogDir "$Stamp.json"
$ErrLog  = Join-Path $LogDir "$Stamp.err.log"
$Summary = Join-Path $LogDir "$Stamp.summary.txt"
Set-Location $Project

function Write-Summary($text) { $text | Out-File -FilePath $Summary -Encoding utf8; Write-Output $text }

# Find Claude Code: on PATH, or the native installer's default location.
$Claude = (Get-Command claude -ErrorAction SilentlyContinue).Source
if (-not $Claude) { $Claude = Join-Path $env:USERPROFILE ".local\bin\claude.exe" }
if (-not (Test-Path $Claude)) { Write-Summary "FAILED: Claude Code not found. Install it or put claude on PATH."; exit 2 }

# Make sure the run uses your Claude subscription login (an ANTHROPIC_API_KEY would take priority and bill the API).
& $Claude auth status *> $null
if ($LASTEXITCODE -ne 0) { Write-Summary "FAILED: Claude Code isn't logged in. Run 'claude' once and log in, or set CLAUDE_CODE_OAUTH_TOKEN (see claude setup-token)."; exit 3 }

# Permissions for this run only:
#  - dontAsk: anything not listed below is denied automatically (nothing waits for a prompt).
#  - reads inside this project folder are allowed by dontAsk itself.
#  - edits only inside ./cyber-reels; web search and fetch; the three subagents; and one exact check command.
$Allowed = @(
  "WebSearch",
  "WebFetch",
  "Agent(content-scout)",
  "Agent(content-reviewer)",
  "Agent(ux-reviewer)",
  "Edit(./cyber-reels/**)",
  "Write(./cyber-reels/**)",
  "Bash(node cyber-reels/tools/check.js)",
  "PowerShell(node cyber-reels/tools/check.js)"
) -join ","

# Back up the app before Claude touches it (step 3 of the workflow), so a rollback copy always exists.
$BackupDir = Join-Path $Project "cyber-reels\backups"
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$Backup = Join-Path $BackupDir ("cyber-reels-" + (Get-Date -Format "yyyy-MM-dd") + ".html")
if (-not (Test-Path $Backup)) { Copy-Item (Join-Path $Project "cyber-reels\cyber-reels.html") $Backup }

$start = Get-Date
& $Claude -p "/weekly-content" `
  --permission-mode dontAsk `
  --allowedTools $Allowed `
  --max-turns 120 `
  --output-format json 1> $JsonLog 2> $ErrLog
$code = $LASTEXITCODE

# Check the app afterwards whatever Claude did (step 6), so a broken file is always caught.
try {
  $Check = (& node (Join-Path $Project "cyber-reels\tools\check.js") 2>&1 | Out-String).Trim()
  $checkCode = $LASTEXITCODE
} catch { $Check = "Skipped: Node.js isn't installed or not on PATH."; $checkCode = 0 }
if ($checkCode -ne 0 -and $code -eq 0) { $code = 4 }
$mins = [math]::Round(((Get-Date) - $start).TotalMinutes, 1)

# Turn the JSON result into a short, readable summary next to it.
try {
  $r = Get-Content $JsonLog -Raw | ConvertFrom-Json
  $cost = if ($r.total_cost_usd) { "{0:N2}" -f $r.total_cost_usd } else { "n/a" }
  Write-Summary @"
Cyber Scroll weekly content run: $(Get-Date -Format "dddd d MMMM yyyy, h:mm tt")
Exit code: $code   Result: $($r.subtype)   Minutes: $mins   Estimated cost (USD, not your bill): $cost
Session id: $($r.session_id)   Permission denials: $(@($r.permission_denials).Count)
Backup: $Backup
App check: $Check

$($r.result)
"@
} catch {
  Write-Summary "Run finished with exit code $code after $mins minutes, but the JSON output couldn't be read. See $ErrLog."
}
exit $code
