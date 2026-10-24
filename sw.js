// Cleanest Hour service worker: precache the app shell and every region file so the
// tool keeps working offline after the first visit.
const VERSION = "ch-v4";
const SHELL = ["./", "index.html", "css/style.css", "js/app.js", "js/calc.js", "icon.svg", "manifest.webmanifest", "data/index.json"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    try {
      const index = await (await fetch("data/index.json")).json();
      await cache.addAll(index.regions.map((r) => `data/${r.ba}.json`));
    } catch (e) { /* regions are cached on first use instead */ }
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

// cache-first for same-origin GETs, filling the cache on miss
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  })());
});
