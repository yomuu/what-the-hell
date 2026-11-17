# Publish Cyber Scroll and install it on Android

GitHub Pages hosts the app for free at `https://YOUR-USERNAME.github.io/cyber-scroll/`. The workflow in `.github/workflows/pages.yml` checks the app and publishes only the app files every time `main` changes.

## 1. Create the repository (GitHub website)

1. Sign in at https://github.com and click **+** (top right), then **New repository**.
2. Repository name: `cyber-scroll`. Choose **Public**. GitHub Pages is free for public repositories on a free plan.
3. Leave **Add a README**, **.gitignore** and **licence** unticked, so the repository starts empty.
4. Click **Create repository**.

## 2. Turn on GitHub Pages

1. In the new repository, open **Settings**, then **Pages** in the left menu.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**. There's nothing else to choose.

## 3. Push the app

Either tell Claude the repository exists so it can push it for you, or push it yourself from a copy of this folder:

```bash
git init -b main
git add .
git commit -m "Cyber Scroll"
git remote add origin https://github.com/YOUR-USERNAME/cyber-scroll.git
git push -u origin main
```

The contents of this `cyber-reels` folder go at the top of the repository, so `index.html` and the `.github` folder sit at its root.

## 4. Check it published

1. Open the repository's **Actions** tab. "Deploy to GitHub Pages" should finish with a green tick in a minute or two.
2. If it fails at **Check the app**, open the run to see what `tools/check.js` reported.
3. **Settings > Pages** now shows "Your site is live at ...". Open that link on your PC to check it loads.

## 5. Install on your Android phone

1. Open the link in **Chrome** on your phone.
2. Wait for the cards to load, then either:
   - tap **Install app** on the first Study card (or in the Days sheet), then **Install**, or
   - tap the **⋮** menu (top right), then **Add to Home screen** or **Install app**.
3. Open **Cyber Scroll** from your home screen. It opens full screen, without the browser bar.

Samsung Internet also installs it: tap **≡**, then **Add page to**, then **Home screen**.

## Working offline

- **The app and all its cards** are saved the first time it loads, so it works offline straight away.
- **Python's Run buttons** download Python (about 14 MB) the first time you tap one. After that they work offline too. Do that first run on Wi-Fi.
- **Your progress** stays on the phone. Use **Copy backup** in the Days sheet now and then, because uninstalling the app or clearing Chrome's data deletes it.

## Updates

When you merge a change to `main` (for example a weekly content pull request), GitHub publishes it. The next time you open the app it shows **New content this week, tap to refresh**. Tap it to switch to the new version, or **Later** to keep going.
