# Cyber Bunker

A swipe-up study app for cyber and cloud security, built to replace scrolling Instagram Reels. It has three tabs:

- **Study:** a 35-day plan (Stage 1 fundamentals plus a Stage 2 Microsoft and cloud identity week), with lessons, real incidents, lab tasks and quizzes.
- **Feed:** an endless, shuffled feed of OWASP Top 10:2025, incident, Essential Eight, cloud, AU/NZ law, triage, KQL, interview and quick-fire decks, with spaced-repetition reviews mixed in.
- **Python:** 14 lessons from a first script to log parsing, hashing, port checks, a boto3 audit and a brute-force detector. Most code examples have a **Run** button that runs real Python in the app (Pyodide, downloaded on first use and then kept for offline use).

Progress, reviews, streaks and stories are saved in the browser. Use **Days → Back up your progress** to move them to another device.

It's an installable web app (PWA) that works offline. **To publish it on GitHub Pages and install it on Android, follow [PUBLISH.md](PUBLISH.md).**

## How it's built

| File | What it is |
|---|---|
| `index.html` | The page: layout, styles and a small loader |
| `app.js` | The app engine |
| `content/study.json`, `feed.json`, `python.json` | All the cards. Edit these to change content |
| `content/version.json` | The content version and date |
| `sw.js` | The service worker: caches everything for offline use and offers updates |
| `manifest.webmanifest`, `icon*.png`, `icon.svg` | Lets you add it to your home screen as an app |
| `.github/workflows/pages.yml` | Publishes only the app files to GitHub Pages when `main` changes |
| `.github/workflows/check.yml` | Runs `tools/check.js` on every pull request |
| `tools/check.js` | Checks the JSON, dashes, scripts and versions |
| `tools/bump-version.js` | Raises the content version after any change |
| `cyber-bunker-handoff.md` | Accuracy and style rules for all content |

## Updates

Every content change needs a new version: run `node tools/bump-version.js "What changed"`, then `node tools/check.js`.

The version is also written into `sw.js`. Each time the app opens, the browser checks for a newer `sw.js`. If there is one, it downloads the new files in the background and the app shows **New content this week, tap to refresh**. Tapping it switches to the new version. Until then, and when offline, the app uses the cached copy. A version whose content fails its check is never installed, so a bad update can't break the app on your phone.

## Weekly content

`/weekly-content` (in `.claude/commands/`) researches new incidents with the content-scout subagent, fact-checks them with content-reviewer, adds them to `content/feed.json`, bumps the version, checks the app and opens a pull request titled "Weekly content YYYY-MM-DD". Merging the pull request publishes it through GitHub Pages. See `tools/WEEKLY-TASK.md` to run it every Sunday with Windows Task Scheduler.

## Run it locally

```
python -m http.server 8000
```

Then open http://localhost:8000. The app needs a web server (or GitHub Pages) because it loads its content with `fetch`. Opening `index.html` as a file won't work.

## Content format

Content lives in strict JSON: double quotes, no trailing commas, no comments. Text supports `inline code` with backticks; no HTML; no em or en dashes; Australian/NZ spelling.

- **Study day** (`content/study.json` → `days`): `t` title, `sub`, `learn` (`[heading, body, code?]` items), `real` (`[heading, body]`), `myth` (`[myth, fact]`), `tryit` (`{h, p, code, where}`), `review` (optional `[heading, body]` items), `quiz` (`[{q, code?, o, k, w, d}]`), `recap` (strings).
- **Python lesson** (`content/python.json` → `lessons`): the same shape as a Study day.
- **Feed deck** (`content/feed.json` → `decks`): `id`, `kind` (owasp, incident, e8, cloud, law, triage, interview, kql, quick), `tag`, `title`, `cards` (`[heading, text, code?]` items), `q` (one check), and optionally `qs`, `all`, `after`, `maps`, `attack`, `region`, and `added` (`YYYY-MM-DD`, shown as "New this week" for seven days). Interview decks use `answer` instead of `cards`.
- **Questions:** `o` lists the options (they're shuffled on screen), `k` is the index of the right one, `w` explains the answer, and `d` is the difficulty from 1 to 3.
