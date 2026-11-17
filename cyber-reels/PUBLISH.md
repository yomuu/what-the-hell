# Publish Cyber Scroll and install it on Android

GitHub Pages hosts the app for free at `https://YOUR-USERNAME.github.io/cyber-scroll/`. The workflow in `.github/workflows/pages.yml` checks the app and publishes only the app files every time `main` changes.

## 1. Create the repository (GitHub website)

1. Sign in at https://github.com and click **+** (top right), then **New repository**.
2. Repository name: `cyber-scroll`. Choose **Public**. GitHub Pages is free for public repositories on a free plan.
   Public means anyone can read every file in it, including the agent settings in `.claude/`, the research drafts in `content/inbox/` and `cyber-reels-handoff.md`. None of them hold passwords or personal details, but have a look first if you've added anything of your own. Run logs and backups are never uploaded.
3. Leave **Add README** off, and set **.gitignore** and **license** to **None**, so the repository starts empty.
4. Click **Create repository**.

## 2. Turn on GitHub Pages

1. In the new repository, open **Settings**, then **Pages** in the left menu.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**. There's nothing else to choose.

## 3. Upload the app

**Easiest:** tell Claude the repository exists (for example "I created yomuu/cyber-scroll"). Claude pushes the contents of the `cyber-reels` folder as the top level of the repository, so `index.html` and `.github` sit at its root.

**Doing it yourself with GitHub Desktop** (no command line):

1. Copy the `cyber-reels` folder somewhere outside the `what-the-hell` folder, for example to `Documents\cyber-scroll`.
2. Install GitHub Desktop from https://desktop.github.com and sign in with your GitHub account.
3. **File > Add local repository**, choose the copied folder, and click **create a repository** when it offers to. Then click **Commit to main**.
4. Click **Publish repository**. Untick **Keep this code private**, and pick the `cyber-scroll` repository you created (or let it create one with that name).

## 4. Check it published

1. Open the repository's **Actions** tab. "Deploy to GitHub Pages" should finish with a green tick in a minute or two.
2. If it fails at **Check the app**, open the run to see what `tools/check.js` reported.
3. **Settings > Pages** now shows "Your site is live at ...". Open that link on your PC to check it loads.

## 5. Install on your Android phone

1. Open the link in **Chrome** on your phone.
2. Wait for the cards to load, then either:
   - tap **Install app** on the first card of any tab, or in the Days sheet, then **Install**, or
   - if there's no Install app button yet (Chrome sometimes waits until you've used the page for a bit), tap the **⋮** menu (top right), then **Add to Home screen** or **Install app**. If asked, choose **Install**, not **Create shortcut**: a shortcut opens as a normal browser tab.
3. Open **Cyber Scroll** from your home screen. It opens full screen, without the browser bar.

Samsung Internet also installs it: tap **≡**, then **Add page to**, then **Home screen**.

## Working offline

- **The app and all its cards** are saved in the background the first time it loads. Give it a few seconds on that first visit; after that it works offline. Fonts may look plain offline until your second visit.
- **Python's Run buttons** ask before downloading Python (about 14 MB) the first time. Do that on Wi-Fi. A message tells you once it's saved, and then Run works offline too.
- **Your progress** stays on the phone. Now and then, tap **Days** (top right of the Study tab), then **Copy backup**, and keep the text somewhere safe: uninstalling the app or clearing Chrome's data deletes your progress.

## Updates

When a change is merged into `main` (for example a weekly content pull request), GitHub publishes it within a few minutes. The next time you open the app online, after a few seconds it shows **New content this week, tap to refresh**. Tap it to switch to the new version, or **Later** to keep going.

Phones only notice a change when the content version goes up. The weekly run does this for you. If you or Claude change any app file by hand, run `node tools/bump-version.js "what changed"` before merging; the pull request check fails if you forget.
