#!/usr/bin/env bash
# Linux/macOS equivalent of run-weekly-content.ps1 (same command and permissions). Used to test the workflow.
set -u
cd "$(dirname "$0")/../.."
LOG_DIR=cyber-reels/content/logs; mkdir -p "$LOG_DIR"
STAMP=$(date +%Y-%m-%d_%H%M)
claude auth status >/dev/null 2>&1 || { echo "FAILED: Claude Code isn't logged in." | tee "$LOG_DIR/$STAMP.summary.txt"; exit 3; }
ALLOWED="WebSearch,WebFetch,Agent(content-scout),Agent(content-reviewer),Agent(ux-reviewer),Edit(./cyber-reels/**),Write(./cyber-reels/**),Bash(node cyber-reels/tools/check.js),PowerShell(node cyber-reels/tools/check.js)"
mkdir -p cyber-reels/backups
BACKUP="cyber-reels/backups/cyber-reels-$(date +%Y-%m-%d).html"
[ -f "$BACKUP" ] || cp cyber-reels/cyber-reels.html "$BACKUP"
START=$(date +%s)
claude -p "/weekly-content" --permission-mode dontAsk --allowedTools "$ALLOWED" --max-turns 120 --output-format json \
  > "$LOG_DIR/$STAMP.json" 2> "$LOG_DIR/$STAMP.err.log"
CODE=$?
CHECK=$(node cyber-reels/tools/check.js 2>&1); CHECK_CODE=$?
[ $CHECK_CODE -ne 0 ] && [ $CODE -eq 0 ] && CODE=4
MINS=$(( ($(date +%s) - START) / 60 ))
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
console.log(`Cyber Scroll weekly content run: ${new Date().toString()}\nExit code: ${process.argv[2]}   Result: ${r.subtype}   Minutes: ${process.argv[3]}   Estimated cost (USD, not your bill): ${(r.total_cost_usd||0).toFixed(2)}\nSession id: ${r.session_id}\nPermission denials: ${(r.permission_denials||[]).length}\nBackup: ${process.argv[4]}\nApp check: ${process.argv[5]}\n\n${r.result}`)' \
  "$LOG_DIR/$STAMP.json" "$CODE" "$MINS" "$BACKUP" "$CHECK" > "$LOG_DIR/$STAMP.summary.txt" 2>>"$LOG_DIR/$STAMP.err.log" || echo "Exit $CODE; JSON unreadable, see $STAMP.err.log" > "$LOG_DIR/$STAMP.summary.txt"
cat "$LOG_DIR/$STAMP.summary.txt"
exit $CODE
