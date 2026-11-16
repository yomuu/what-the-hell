#!/usr/bin/env bash
# Linux/macOS equivalent of run-weekly-content.ps1 (same command and permissions).
set -u
cd "$(dirname "$0")/.."
LOG_DIR=content/logs; mkdir -p "$LOG_DIR"
STAMP=$(date +%Y-%m-%d_%H%M)
claude auth status >/dev/null 2>&1 || { echo "FAILED: Claude Code isn't logged in." | tee "$LOG_DIR/$STAMP.summary.txt"; exit 3; }
BACKUP="backups/$(date +%Y-%m-%d)"
[ -d "$BACKUP" ] || { mkdir -p "$BACKUP" && cp content/*.json sw.js "$BACKUP/"; }
CMDS=("node tools/check.js" "node tools/bump-version.js *" "git switch main" "git pull" "git status" "git switch -c weekly-content/*"
      "git add content sw.js index.html app.js" "git commit -m *" "git push -u origin weekly-content/*" "gh pr create *")
ALLOWED="WebSearch,WebFetch,Agent(content-scout),Agent(content-reviewer),Agent(ux-reviewer),Edit(./content/**),Write(./content/**),Edit(./index.html),Edit(./app.js)"
for c in "${CMDS[@]}"; do ALLOWED="$ALLOWED,Bash($c),PowerShell($c)"; done
START=$(date +%s)
claude -p "/weekly-content" --permission-mode dontAsk --allowedTools "$ALLOWED" --max-turns 150 --output-format json \
  > "$LOG_DIR/$STAMP.json" 2> "$LOG_DIR/$STAMP.err.log"
CODE=$?
CHECK=$(node tools/check.js 2>&1); CHECK_CODE=$?
[ $CHECK_CODE -ne 0 ] && [ $CODE -eq 0 ] && CODE=4
MINS=$(( ($(date +%s) - START) / 60 ))
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
console.log(`Cyber Scroll weekly content run: ${new Date().toString()}\nExit code: ${process.argv[2]}   Result: ${r.subtype}   Minutes: ${process.argv[3]}   Estimated cost (USD, not your bill): ${(r.total_cost_usd||0).toFixed(2)}\nSession id: ${r.session_id}\nPermission denials: ${(r.permission_denials||[]).length}\nBackup: ${process.argv[4]}\nApp check: ${process.argv[5]}\n\n${r.result}`)' \
  "$LOG_DIR/$STAMP.json" "$CODE" "$MINS" "$BACKUP" "$CHECK" > "$LOG_DIR/$STAMP.summary.txt" 2>>"$LOG_DIR/$STAMP.err.log" \
  || echo "Exit $CODE; JSON unreadable, see $STAMP.err.log" > "$LOG_DIR/$STAMP.summary.txt"
cat "$LOG_DIR/$STAMP.summary.txt"
exit $CODE
