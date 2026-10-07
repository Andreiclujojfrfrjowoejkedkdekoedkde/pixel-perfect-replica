// Serves downloaded map tiles and fonts from cache when available.
const CACHE = "meridian-tiles-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.hostname !== "tiles.openfreemap.org") return;
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const hit = await c.match(e.request.url);
      if (hit) return hit;
      return fetch(e.request);
    }),
  );
});
