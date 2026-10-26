// Offline support: the app itself (network first, so updates arrive) and every map tile
// you have viewed (cache first). Spot data is cached separately in IndexedDB by src/live.ts.
const SHELL = "shell-v1";
const TILES = "tiles-v1";
const MAX_TILES = 3000;
const TILE_HOSTS = ["tile.openstreetmap.org", "cyberjapandata.gsi.go.jp"];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== TILES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trimTiles() {
  const cache = await caches.open(TILES);
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_TILES))) await cache.delete(k);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (TILE_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.open(TILES).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        // Only CORS responses: opaque ones cost megabytes of quota each.
        if (res.ok && res.type === "cors") {
          cache.put(req, res.clone());
          if (Math.random() < 0.02) trimTiles();
        }
        return res;
      }),
    );
    return;
  }

  // Spot datasets (~1 MB): answer from cache at once, refresh in the background.
  if (url.origin === self.location.origin && /\/data\/[^/]+\.json$/.test(url.pathname)) {
    e.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const hit = await cache.match(req);
        const refresh = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit ?? Response.error());
        if (hit) {
          e.waitUntil(refresh);
          return hit;
        }
        return refresh;
      }),
    );
    return;
  }

  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(async () => (await caches.match(req)) ?? (req.mode === "navigate" ? caches.match(self.registration.scope) : Response.error())),
    );
  }
});
