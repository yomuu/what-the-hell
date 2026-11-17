#!/usr/bin/env bash
# Builds _site/ with only the app's own files (no inbox drafts, logs, tools or agent settings).
# Cloudflare Pages runs this: build command "bash tools/build-site.sh", output directory "_site".
set -euo pipefail
node tools/check.js
rm -rf _site && mkdir -p _site/content
cp index.html app.js sw.js manifest.webmanifest icon.svg icon-192.png icon-512.png icon-maskable-512.png .nojekyll _site/
cp content/study.json content/feed.json content/python.json content/version.json _site/content/
[ -f content/wire.json ] && cp content/wire.json _site/content/
# Keep the page and service worker fresh so updates arrive; content files carry ?v= when the worker updates.
cat > _site/_headers <<'H'
/sw.js
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/
  Cache-Control: no-cache
H
echo "Built _site: $(ls _site | wc -l) files plus content/"
