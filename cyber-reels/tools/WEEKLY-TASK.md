# Weekly content task (Windows)

Every Sunday at 7pm, Task Scheduler runs `/weekly-content` with Claude Code in headless mode. It researches new incidents, has them fact-checked, adds them to the Feed tab, checks the app, and writes a changelog entry.

## One-time setup

1. Pull this branch so your project folder has `.claude/agents/content-scout.md`, `.claude/commands/weekly-content.md` and `cyber-reels/tools/`.
2. Make sure Claude Code is installed and logged in with your subscription. In PowerShell:
   ```powershell
   claude auth status
   ```
   It should say `"loggedIn": true`. If an `ANTHROPIC_API_KEY` environment variable is set, the run bills the API instead of your subscription, so remove it unless that's what you want.
3. Make sure Node.js is installed (`node --version`), because the run checks the app with `node cyber-reels/tools/check.js`.
4. From the project folder, register the task and start a test run:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\cyber-reels\tools\register-weekly-task.ps1 -RunNow
   ```

The task runs as you, only while you're logged on, so it uses your existing Claude Code login and stores no password. If your PC is off or asleep at 7pm, it runs as soon as it can afterwards. It stops after two hours if anything hangs.

## What it's allowed to do

The permissions apply to this scheduled run only (they're on the command line in `run-weekly-content.ps1`, not in your project settings):

- **Allowed:** reading files in the project folder, web search and fetch, the content-scout, content-reviewer and ux-reviewer subagents, creating and editing files inside `cyber-reels/`, and running the single command `node cyber-reels/tools/check.js`.
- **Denied automatically** (`--permission-mode dontAsk`): everything else, including edits outside `cyber-reels/` (such as `.claude/`), any other shell or PowerShell command, and files outside the project. A denied action is refused and logged; the run never waits for an answer.

## Checking the output

Each run writes three files to `cyber-reels\content\logs\`, named by date and time:

| File | What's in it |
|---|---|
| `YYYY-MM-DD_HHmm.summary.txt` | Start here: exit code, minutes taken, and Claude's summary of what was added and what to double-check |
| `YYYY-MM-DD_HHmm.json` | The full result, including `permission_denials` (anything it tried but wasn't allowed to do) |
| `YYYY-MM-DD_HHmm.err.log` | Errors, if any |

The run also leaves:

- `cyber-reels\content\inbox\YYYY-MM-DD.md`: the researched decks with their sources, after fact-checking
- `cyber-reels\backups\cyber-reels-YYYY-MM-DD.html`: the app as it was before the run
- `cyber-reels\content\CHANGELOG.md`: a new entry with what was added and three ideas for next week

Handy PowerShell commands:

```powershell
# Last result (0 means success) and next run time
Get-ScheduledTaskInfo -TaskName "Cyber Scroll weekly content" | Select-Object LastRunTime, LastTaskResult, NextRunTime

# Read the newest summary
Get-ChildItem .\cyber-reels\content\logs\*.summary.txt | Sort-Object LastWriteTime | Select-Object -Last 1 | Get-Content

# See exactly what changed in the app
git diff -- cyber-reels/cyber-reels.html

# Run it again by hand, or remove the task
Start-ScheduledTask -TaskName "Cyber Scroll weekly content"
Unregister-ScheduledTask -TaskName "Cyber Scroll weekly content" -Confirm:$false
```

In the Task Scheduler app, the task is under Task Scheduler Library as "Cyber Scroll weekly content". The History tab shows each run, if task history is turned on.

## If something goes wrong

- **Last result 2 or 3, or a summary saying it isn't logged in:** run `claude` in PowerShell once and log in. For a run that doesn't depend on your Windows login, create a token with `claude setup-token` and set it as a user environment variable named `CLAUDE_CODE_OAUTH_TOKEN`.
- **New decks look wrong:** restore the backup over `cyber-reels\cyber-reels.html`, or run `git checkout -- cyber-reels/cyber-reels.html`.
- **Your published claude.ai link doesn't change:** the task updates the file on your PC only. Ask Claude to republish it, or commit and push the change.
