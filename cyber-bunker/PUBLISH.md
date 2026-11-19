# Host Cyber Bunker privately and install it on Android

The code stays in your **private** GitHub repository (yomuu/CyberBunker). Cloudflare Pages builds the site from it for free, and Cloudflare Access puts a sign-in in front of it that only your email address can pass. Everyone else sees a sign-in page, not the app.

You'll do this once, in about 15 minutes, on a computer. Cloudflare's screens change from time to time; if a button has a slightly different name, look for the closest match.

## 1. Create the site on Cloudflare Pages

1. Sign up (free) at https://dash.cloudflare.com.
2. Go to **Workers & Pages**, click **Create**, choose the **Pages** tab, then **Connect to Git** (or "Import an existing Git repository").
3. Connect GitHub. When GitHub asks which repositories Cloudflare may see, choose **Only select repositories** and pick **CyberBunker**.
4. Select **CyberBunker** and set:
   - **Project name:** something hard to guess, for example `cb-` plus a few random letters. It becomes your address: `https://PROJECT-NAME.pages.dev`.
   - **Production branch:** `main`
   - **Framework preset:** None
   - **Build command:** `bash tools/build-site.sh`
   - **Build output directory:** `_site`
5. Click **Save and Deploy**. When it finishes, open the `.pages.dev` link once to check the app loads. (It's not protected yet, so do step 2 straight away.)
6. In the project's **Settings**, find **Builds** (or "Builds & deployments") and turn **preview deployments** off (set them to **None**). Previews would otherwise publish pull request branches at extra, unprotected addresses.

## If Cloudflare made a Worker instead of a Pages project

Cloudflare sometimes sets the site up as a **Worker** (the address ends in `.workers.dev` and the build log runs `npx wrangler deploy`). That works too. `wrangler.jsonc` in this repository makes the Worker publish only `_site`, and turns off extra preview addresses. Keep **Build command** `bash tools/build-site.sh` and **Deploy command** `npx wrangler deploy`.

To lock a Worker: open the Worker in the dashboard, go to **Settings**, then **Domains & Routes**, and on the `workers.dev` row turn on **Cloudflare Access**. Then follow step 2 to make sure its policy allows only your email.

## 2. Lock it to your email with Cloudflare Access

1. Open **Zero Trust** from the Cloudflare dashboard (https://one.dash.cloudflare.com). The first time, it asks for a team name (anything) and a plan: choose **Free** (up to 50 users). It may ask for a payment card even for the free plan; you aren't charged on Free.
2. Go to **Access**, then **Applications**, then **Add an application**, and choose **Self-hosted**.
3. Set:
   - **Application name:** Cyber Bunker
   - **Session duration:** **1 month** (the longest), so you rarely need to sign in again.
   - **Domain:** your `PROJECT-NAME.pages.dev` address (or your `.workers.dev` address). If you turned on Access from the Worker's settings, the application already exists: open it under **Access**, then **Applications**, and edit it instead.
4. Add a policy: **Action: Allow**, **Include: Emails**, and enter your own email address. Save.
5. Under authentication, keep **One-time PIN**: Cloudflare emails you a code when you sign in.
6. Check it: open your `.pages.dev` address in a private browser window. You should see a Cloudflare sign-in page. Enter your email and the code, and the app opens.

## 3. Install on your Android phone

1. Open your `.pages.dev` address in **Chrome** on your phone and sign in with your email and the emailed code.
2. Wait for the cards to load, then tap **Install app** on the first card, or tap the **⋮** menu, then **Add to Home screen**, then **Install** (not "Create shortcut").
3. Open **Cyber Bunker** from your home screen. On Wi-Fi, tap Run once in the Terminal tab so Python is saved for offline use.

## Day to day

- **Offline:** the app and all its cards are kept on the phone, so it works without signal and without signing in.
- **Updates:** when a change is merged into `main` (for example a weekly content pull request), Cloudflare rebuilds the site within a few minutes. The next time you open the app online, it shows **New content this week, tap to refresh**.
- **Signing in again:** about once a month your Cloudflare sign-in expires. The app keeps working, and shows **Sign in again to get new content**. Tap it, enter the emailed code, then reopen the app.
- **Your progress** stays on the phone. Now and then, tap **Days** (top right of the Training Bunker tab), then **Copy backup**, and keep the text somewhere safe.
- **Version numbers:** phones only notice a change when the content version goes up. The weekly run does this. If you or Claude change app files by hand, run `node tools/bump-version.js "what changed"` before merging; the pull request check fails if you forget.

## Why not GitHub Pages?

On a free GitHub plan, GitHub Pages only works from a public repository, and the site itself is always public. The workflow is still in `.github/workflows/pages.yml` but only runs if you start it by hand.
