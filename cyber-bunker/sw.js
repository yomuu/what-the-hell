/* Cyber Bunker service worker.
   VERSION changes whenever the app or its content changes (tools/bump-version.js does this),
   which makes the browser install this worker again and download the new files. */
const VERSION = 43;
const CACHE = "cyber-bunker-v" + VERSION;
const PYODIDE_VERSION = "0.27.7";   // keep in step with app.js
const PYODIDE_CACHE = "cyber-bunker-pyodide-" + PYODIDE_VERSION;
const ASSETS = [
  "./", "index.html", "app.js", "game.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png",
  "content/study.json", "content/feed.json", "content/python.json", "content/version.json", "content/certs.json"
];

self.addEventListener("install", event => {
  const firstInstall = !self.registration.active;
  event.waitUntil((async () => {
    // Updates ask for "?v=VERSION" copies with cache "reload", so neither the phone's cache nor
    // GitHub Pages' CDN can hand back an older file. The first install can reuse what the page just loaded.
    const responses = await Promise.all(ASSETS.map(async u => {
      const url = firstInstall ? u : u + (u.includes("?") ? "&" : "?") + "v=" + VERSION;
      const res = await fetch(new Request(url, {cache: firstInstall ? "default" : "reload"}));
      if (!res.ok) throw new Error(`${u}: HTTP ${res.status}`);
      return [u, res];
    }));
    // Never install a version whose content is broken or out of step: the old version stays in use instead.
    const json = name => responses.find(([u]) => u === `content/${name}.json`)[1].clone().json();
    const [study, feed, py, ver] = await Promise.all(["study", "feed", "python", "version"].map(json));
    const ok = Array.isArray(study.weeks) && Array.isArray(study.days) && study.days.length > 0 &&
      Array.isArray(feed.decks) && feed.decks.length > 0 && Array.isArray(py.levels) && Array.isArray(py.lessons) &&
      Number(ver.version) === VERSION;
    if (!ok) throw new Error(`Content for version ${VERSION} failed its check; keeping the current version.`);
    const cache = await caches.open(CACHE);
    // Some hosts redirect index.html to "/". A redirected response can't answer a page load later,
    // so store a clean copy of it.
    const clean = async res => res.redirected ? new Response(await res.blob(), {status: res.status, statusText: res.statusText, headers: res.headers}) : res;
    await Promise.all(responses.map(async ([u, res]) => cache.put(u, await clean(res))));
    // Also keep a first copy of Bunker Radio's wire for offline use (optional: no wire, no problem).
    try {
      const w = await fetch(new Request("content/wire.json", {cache: "no-store"}));
      if (w.ok && !w.redirected && /json/.test(w.headers.get("content-type") || "")) await (await caches.open("cyber-bunker-wire")).put("content/wire.json", w);
    } catch (e) {}
  })());
  // The very first install takes over straight away; later versions wait until you tap the banner.
  if (firstInstall) self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("cyber-scroll-") || (k.startsWith("cyber-bunker-v") && k !== CACHE) || (k.startsWith("cyber-bunker-pyodide") && k !== PYODIDE_CACHE)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // App and content: from this version's cache, so it's consistent and works offline.
  // ?signin and ?ping always go to the network, so a private host's sign-in page (Cloudflare Access) can appear.
  if (url.origin === location.origin && (url.searchParams.has("signin") || url.searchParams.has("ping"))) return;

  // Bunker Radio's wire changes every few hours without a new app version: network first, last copy offline.
  if (url.origin === location.origin && url.pathname.endsWith("/content/wire.json")) {
    event.respondWith(caches.open("cyber-bunker-wire").then(cache =>
      fetch(req, {cache: "no-store"}).then(res => {
        // Only keep real JSON (never a redirected sign-in page) as the offline copy.
        if (res.ok && !res.redirected && /json/.test(res.headers.get("content-type") || "")) event.waitUntil(cache.put("content/wire.json", res.clone()).catch(() => {}));
        return res;
      }).catch(() => cache.match("content/wire.json").then(hit => {
        if (!hit) return new Response(null, {status: 503});
        const h = new Headers(hit.headers); h.set("x-wire-offline", "1");
        return hit.blob().then(b => new Response(b, {status: 200, headers: h}));
      }))
    ));
    return;
  }

  if (url.origin === location.origin) {
    event.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(req, {ignoreSearch: true}).then(hit => {
          if (hit) return hit;
          if (req.mode === "navigate") return cache.match("index.html").then(page => page || fetch(req));
          return fetch(req);
        })
      )
    );
    return;
  }

  // Pyodide (Python for the Run buttons): downloaded the first time you run code, then served from this cache.
  // The files never change for a given Pyodide version, so the cache is kept across app updates.
  if (url.hostname === "cdn.jsdelivr.net" && url.pathname.startsWith("/pyodide/v" + PYODIDE_VERSION + "/full/")) {
    event.respondWith(
      caches.open(PYODIDE_CACHE).then(cache =>
        cache.match(req).then(hit => hit || fetch(req).then(res => {
          // waitUntil keeps the worker alive until the (large) file is fully saved.
          if (res.ok || res.type === "opaque") event.waitUntil(cache.put(req, res.clone()).catch(() => {}));
          return res;
        }))
      )
    );
    return;
  }

  // Google Fonts (requested with CORS): serve from cache when there, refresh in the background.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open("cyber-bunker-fonts").then(cache =>
        cache.match(req).then(hit => {
          const fresh = fetch(req).then(res => { if (res.ok) event.waitUntil(cache.put(req, res.clone()).catch(() => {})); return res; }).catch(() => hit);
          return hit || fresh;
        })
      )
    );
  }
});
