/* Cyber Scroll service worker.
   VERSION changes whenever the app or its content changes (tools/bump-version.js does this),
   which makes the browser install this worker again and download the new files. */
const VERSION = 1;
const CACHE = "cyber-scroll-v" + VERSION;
const ASSETS = [
  "./", "index.html", "app.js", "manifest.webmanifest", "icon.svg",
  "content/study.json", "content/feed.json", "content/python.json", "content/version.json"
];

self.addEventListener("install", event => {
  // cache: "reload" skips the browser's HTTP cache, so a new version gets truly fresh files.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(u => new Request(u, {cache: "reload"})))));
  // The very first install takes over straight away; later versions wait until you tap "refresh".
  if (!self.registration.active) self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("cyber-scroll-") && k !== CACHE).map(k => caches.delete(k))))
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

  // Google Fonts: serve from cache when there, refresh in the background.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open("cyber-scroll-fonts").then(cache =>
        cache.match(req).then(hit => {
          const fresh = fetch(req).then(res => { if (res.ok || res.type === "opaque") cache.put(req, res.clone()); return res; }).catch(() => hit);
          return hit || fresh;
        })
      )
    );
  }
});
