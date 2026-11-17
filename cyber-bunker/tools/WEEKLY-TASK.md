# Weekly content task (Windows)

Every Sunday at 7pm, Task Scheduler runs `/weekly-content` with Claude Code in headless mode. It researches new incidents, has them fact-checked, adds them to The Archive, raises the content version, checks the app, and opens a pull request called "Weekly content YYYY-MM-DD". When you merge the pull request, GitHub Pages publishes it, and the app on your phone shows "New content this week, tap to refresh" the next time you open it.

## One-time setup

1. Clone the Cyber Bunker repository to your PC and open PowerShell in that folder.
2. Make sure these work:
   ```powershell
   claude auth status   # should say "loggedIn": true
   node --version       # Node.js runs the check and version scripts
   git --version
   gh auth status       # GitHub CLI, logged in, so the run can open the pull request
   ```
   If `gh` is missing, install it from https://cli.github.com and run `gh auth login`. If an `ANTHROPIC_API_KEY` environment variable is set, runs bill the API instead of your subscription.
3. Register the task and start a test run:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\register-weekly-task.ps1 -RunNow
   ```

The task runs as you, only while you're logged on, so it uses your existing Claude Code and GitHub logins and stores no password. If your PC is off or asleep at 7pm, it runs as soon as it can afterwards. It stops after two hours if anything hangs.

## What it's allowed to do

The permissions are on the command line in `run-weekly-content.ps1`, for this run only:

- **Allowed:** reading files in the project folder; web search and fetch; the content-scout, content-reviewer and ux-reviewer subagents; editing `content/`, `index.html` and `app.js`; running `node tools/check.js` and `node tools/bump-version.js`; and these exact git and gh commands: `git switch main`, `git pull`, `git status`, `git switch -c weekly-content/...`, `git add content sw.js index.html app.js`, `git commit -m ...`, `git push -u origin weekly-content/...` and `gh pr create ...`.
- **Denied automatically** (`--permission-mode dontAsk`): everything else. That includes editing `.claude/` or `tools/`, pushing to `main`, merging, any other command, and files outside the project. A denied action is refused and logged; the run never waits for an answer.

Nothing reaches your live app until you merge the pull request.

## Checking the output

Each run writes to `content\logs\`. Start with the newest `YYYY-MM-DD_HHmm.summary.txt`: it has the exit code, minutes taken, the backup folder, the app check result, and Claude's summary with the pull request link.

- **The pull request** on GitHub shows exactly what changed, with the summary as its description. Review it, then merge or close it.
- `content\inbox\YYYY-MM-DD.md` has the researched decks and their sources.
- `content\CHANGELOG.md` gets a new entry with three ideas for future weeks.
- `backups\YYYY-MM-DD\` holds the content files from before the run.

Handy PowerShell commands:

```powershell
Get-ScheduledTaskInfo -TaskName "Cyber Bunker weekly content" | Select-Object LastRunTime, LastTaskResult, NextRunTime
Get-ChildItem .\content\logs\*.summary.txt | Sort-Object LastWriteTime | Select-Object -Last 1 | Get-Content
gh pr list
Start-ScheduledTask -TaskName "Cyber Bunker weekly content"
Unregister-ScheduledTask -TaskName "Cyber Bunker weekly content" -Confirm:$false
```

## If something goes wrong

- **Last result 4:** Claude finished but `check.js` found a problem. The summary lists it. Don't merge the pull request until it's fixed.
- **Last result 2 or 3, or "not logged in":** run `claude` once and log in. For runs that don't depend on your Windows login, create a token with `claude setup-token` and set it as a user environment variable named `CLAUDE_CODE_OAUTH_TOKEN`.
- **No pull request:** check that `gh auth status` works and that `main` was clean before the run. The summary says which publish step failed; the content is left on the `weekly-content/...` branch to finish by hand.
- **A bad update reached the app:** revert the merge on GitHub (the pull request page has a Revert button). The next version bump reaches phones the same way.
