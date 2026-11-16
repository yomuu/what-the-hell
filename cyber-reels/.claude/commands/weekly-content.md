---
description: Weekly Cyber Scroll content run. Research new incidents, review them, add them to the Feed tab, and open a pull request.
---

Run the weekly content workflow for Cyber Scroll (formerly Cyber Reels). The app's content lives in content/*.json; index.html and app.js are the app itself. This may run unattended from a scheduled task: don't ask questions. If a step can't be done, skip it, carry on, and say so in the final summary. Use YYYY-MM-DD for today's date throughout.

0. Start from an up-to-date main branch: run `git switch main`, then `git pull`. If either fails, stop and explain why in the summary.
1. Use the content-scout subagent to research this week's incidents and draft new decks into content/inbox/YYYY-MM-DD.md.
2. Use the content-reviewer subagent to fact-check that inbox file against its sources and the accuracy rules in cyber-reels-handoff.md. Fix or remove anything it flags. Drop any deck whose key facts can't be confirmed.
3. Back up the content. The scheduled runner script copies content/*.json to backups/YYYY-MM-DD/ before you start, so just confirm the folder exists; if it doesn't, say so in the summary. Don't copy the files yourself.
4. Add the approved decks and quick-fire cards to the end of the `decks` array in content/feed.json. This is strict JSON: double quotes only, no trailing commas, no comments, escape inner double quotes, use backticks for inline code, no HTML, and no em or en dashes. Follow the existing decks as the pattern:
   - Incident decks: `{"id": "inc-<short-name>", "kind": "incident", "tag": "<year>", "title": "<name>", "added": "YYYY-MM-DD", "cards": [["What happened", "..."], ["How they got in", "..."], ["Impact", "..."], ["Lessons", "..."]], "maps": "<OWASP or CSF mapping>", "q": {"d": 2, "q": "...", "o": ["right answer", "wrong", "wrong"], "k": 0, "w": "..."}}`. Add `"region": "NZ/AU"` for New Zealand or Australian incidents.
   - OWASP-focused decks use `"kind": "owasp"` with `"tag": "A0x"` and the same shape.
   - Quick-fire cards are one-card decks: `{"id": "qf-<short-name>", "kind": "quick", "tag": "Quick-fire", "title": "<short title>", "added": "YYYY-MM-DD", "cards": [["<heading>", "<one or two sentences>"]]}`. A `q` is optional.
   - `added` is today's date. The app labels a deck "New this week" for seven days and shows new decks more often. Every `id` must be new.
5. Run `node tools/bump-version.js "Weekly content YYYY-MM-DD"`. This raises the content version in content/version.json and sw.js, which is what makes installed copies of the app show "New content this week, tap to refresh".
6. Use the ux-reviewer subagent to check nothing broke, and fix what it finds. Only edit content/*.json, index.html or app.js. If you change index.html or app.js, run the bump script again.
7. Run `node tools/check.js`. It checks the JSON, em dashes, script syntax and that the versions match. Fix anything it reports and run it again until it passes. The runner script also runs it after you finish.
8. Append a short entry to content/CHANGELOG.md: date, what was added, and content-scout's 3 ideas for future weeks.
9. Publish for review. Write the summary from step 10 to content/inbox/YYYY-MM-DD-pr.md, then run these commands one at a time:
   - `git switch -c weekly-content/YYYY-MM-DD`
   - `git add content sw.js index.html app.js`
   - `git commit -m "Weekly content YYYY-MM-DD"`
   - `git push -u origin weekly-content/YYYY-MM-DD`
   - `gh pr create --base main --title "Weekly content YYYY-MM-DD" --body-file content/inbox/YYYY-MM-DD-pr.md`
   - `git switch main`
   If a command fails (for example the branch already exists, or gh isn't logged in), stop publishing and say what failed in the summary. The content stays on the branch or in the working folder for you to finish by hand.
10. Finish with a summary of what was added, the pull request link, and anything I should double-check.
