/* Meridian service worker.
 *
 * Three jobs:
 *  1. App shell: the document and its hashed build assets are cached so the app
 *     opens with no connection at all (PWA).
 *  2. Downloaded areas: tiles live in one Cache Storage bucket per area
 *     (meridian-area-<id>), so an area can be deleted without touching the rest.
 *  3. Runtime tiles: anything seen while online is kept as a fallback.
 */

const SHELL = "meridian-shell-v1";
const RUNTIME = "meridian-runtime-v1";
const AREA_PREFIX = "meridian-area-";

const SHELL_URLS = ["/", "/manifest.webmanifest"];

/** Hosts whose responses are map data and should be served cache-first. */
const TILE_HOSTS = [
  "tiles.openfreemap.org",
  "api.maptiler.com",
  "server.arcgisonline.com",
  "s3.amazonaws.com",
  "elevation-tiles-prod.s3.amazonaws.com",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // Individually, so one missing file cannot fail the whole install.
      await Promise.all(
        SHELL_URLS.map((url) => cache.add(new Request(url, { cache: "reload" })).catch(() => {})),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      // Only prune our own generations. Area caches are user data and survive.
      await Promise.all(
        names
          .filter(
            (n) =>
              (n.startsWith("meridian-shell-") || n.startsWith("meridian-runtime-")) &&
              n !== SHELL &&
              n !== RUNTIME,
          )
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

const isTileRequest = (url) =>
  TILE_HOSTS.includes(url.hostname) ||
  url.pathname.startsWith("/fonts/") ||
  url.pathname === "/planet";

/** Look in every area cache first, then the runtime fallback. */
async function fromAreaCaches(request) {
  const names = (await caches.keys()).filter((n) => n.startsWith(AREA_PREFIX) || n === RUNTIME);
  for (const name of names) {
    const cache = await caches.open(name);
    const hit = await cache.match(request);
    if (hit) return hit;
  }
  return null;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Map data: cache-first, and remember whatever we had to go to the network for.
  if (isTileRequest(url)) {
    event.respondWith(
      (async () => {
        const hit = await fromAreaCaches(request);
        if (hit) return hit;
        try {
          const res = await fetch(request);
          if (res.ok || res.type === "opaque") {
            const cache = await caches.open(RUNTIME);
            await cache.put(request, res.clone());
          }
          return res;
        } catch (e) {
          return new Response("", { status: 504, statusText: "Offline" });
        }
      })(),
    );
    return;
  }

  const sameOrigin = url.origin === self.location.origin;

  // Hashed build output: safe to serve from cache and refresh in the background.
  if (sameOrigin && (url.pathname.startsWith("/_build/") || url.pathname.startsWith("/assets/"))) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL);
        const hit = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res.ok) void cache.put(request, res.clone());
            return res;
          })
          .catch(() => null);
        return hit ?? (await network) ?? new Response("", { status: 504 });
      })(),
    );
    return;
  }

  // Navigations: network first so a deploy is picked up, shell as the offline net.
  if (sameOrigin && request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(SHELL);
          return (
            (await cache.match("/")) ??
            new Response("Meridian is offline.", {
              status: 503,
              headers: { "content-type": "text/plain" },
            })
          );
        }
      })(),
    );
  }
});

self.addEventListener("message", (event) => {
  // Lets the page ask the worker to release an area's bucket on delete.
  if (event.data?.type === "meridian:drop-area" && typeof event.data.cacheName === "string") {
    event.waitUntil(caches.delete(event.data.cacheName));
  }
});
