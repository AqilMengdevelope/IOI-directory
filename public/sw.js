/*
 * IOI City Mall service worker: makes repeat visits fast and the shell available offline.
 *
 * - Hashed build assets (/_next/static) never change, so they're served cache-first.
 * - Logos, storefront photos, music and models are served from cache and refreshed in the background.
 * - Pages are network-first, so a new build (and the mall data bundled into it) is picked up on the
 *   next visit; the cached page is only a fallback when offline.
 *
 * Bump VERSION to drop every cache on the next activation.
 */
const VERSION = "v1";
const STATIC_CACHE = `ioi-static-${VERSION}`;
const MEDIA_CACHE = `ioi-media-${VERSION}`;
const PAGE_CACHE = `ioi-pages-${VERSION}`;
const PRECACHE = ["/", "/manifest.webmanifest", "/seo/icon-192.png", "/seo/icon-512.png"];
const MEDIA_PREFIXES = ["/ioi/", "/audio/", "/models/", "/maps/", "/seo/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([STATIC_CACHE, MEDIA_CACHE, PAGE_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("ioi-") && !keep.has(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName, event) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  return (await refresh) ?? Response.error();
}

async function networkFirst(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) ?? (await cache.match("/")) ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Audio streams with Range requests; partial responses can't be cached, so leave them alone.
  if (request.headers.has("range")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  } else if (MEDIA_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(staleWhileRevalidate(request, MEDIA_CACHE, event));
  }
});
