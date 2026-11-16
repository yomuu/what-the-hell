/* Cyber Scroll service worker.
   VERSION changes whenever the app or its content changes (tools/bump-version.js does this),
   which makes the browser install this worker again and download the new files. */
const VERSION = 1;
const CACHE = "cyber-scroll-v" + VERSION;
const ASSETS = [
  "./", "index.html", "app.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png",
  "content/study.json", "content/feed.json", "content/python.json", "content/version.json"
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
    await Promise.all(responses.map(([u, res]) => cache.put(u, res)));
  })());
  // The very first install takes over straight away; later versions wait until you tap the banner.
  if (firstInstall) self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("cyber-scroll-v") && k !== CACHE).map(k => caches.delete(k))))
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

  // Google Fonts (requested with CORS): serve from cache when there, refresh in the background.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open("cyber-scroll-fonts").then(cache =>
        cache.match(req).then(hit => {
          const fresh = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
          return hit || fresh;
        })
      )
    );
  }
});
