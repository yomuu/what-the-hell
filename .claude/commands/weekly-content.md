---
description: Weekly Cyber Reels content run. Research new incidents, review them, add them to the Feed tab.
---

Run the weekly content workflow for Cyber Reels (the app is now called Cyber Scroll). All app files are in the cyber-reels/ folder of this project. This may run unattended from a scheduled task: don't ask questions. If a step can't be done, skip it, carry on, and say so in the final summary.

1. Use the content-scout subagent to research this week's incidents and draft new decks into cyber-reels/content/inbox/YYYY-MM-DD.md (today's date).
2. Use the content-reviewer subagent to fact-check that inbox file against its sources and the handoff accuracy rules in cyber-reels/cyber-reels-handoff.md. Fix or remove anything it flags. Drop any deck whose key facts can't be confirmed.
3. Back up cyber-reels/cyber-reels.html to cyber-reels/backups/cyber-reels-YYYY-MM-DD.html. The scheduled runner script makes this copy before you start, so just confirm it exists. Don't try to copy the file yourself; if it's missing, say so in the summary.
4. Add the approved decks and quick-fire cards to the `FEED_DECKS` array in cyber-reels/cyber-reels.html, just before the line `/* ---------------- FEED: Microsoft Sentinel and KQL ----------------`. Use the existing objects as the pattern, and:
   - Incident decks: `{id:"inc-<short-name>", kind:"incident", tag:"<year>", title:"<name>", added:"YYYY-MM-DD", cards:[["What happened","..."],["How they got in","..."],["Impact","..."],["Lessons","..."]], maps:"<OWASP or CSF mapping>", q:{d:2, q:"...", o:["right answer","wrong","wrong"], k:0, w:"..."}}`. Add `region:"NZ/AU"` for New Zealand or Australian incidents.
   - OWASP-focused decks use `kind:"owasp"` with `tag:"A0x"` and the same shape.
   - Quick-fire cards are one-card decks: `{id:"qf-<short-name>", kind:"quick", tag:"Quick-fire", title:"<short title>", added:"YYYY-MM-DD", cards:[["<heading>","<one or two sentences>"]]}`. A `q` is optional.
   - `added` is today's date. The app labels a deck "New this week" for seven days after it, and shows new decks more often.
   - Every `id` must be new. Strings are double-quoted JavaScript: escape inner double quotes, use backticks for inline code, and no HTML. No em or en dashes.
5. Use the ux-reviewer subagent to check nothing broke in cyber-reels/cyber-reels.html, and fix what it finds.
6. Run `node cyber-reels/tools/check.js` with your shell tool (that exact command is allowed). It checks for em dashes, script syntax and deck structure. Fix anything it reports and run it again until it passes. The runner script also runs it after you finish and reports the result.
7. Append a short entry to cyber-reels/content/CHANGELOG.md: date, what was added, and content-scout's 3 ideas for future weeks.
8. Finish with a summary of what was added and anything I should double-check.
