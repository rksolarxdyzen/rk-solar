/* RK CRM offline document shells — static assets + page navigations (SWR). */
const VERSION = "rk-shell-v1";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;

const APP_PREFIXES = [
  "/",
  "/pipeline",
  "/customers",
  "/quotations",
  "/payments",
  "/installation",
  "/liaison",
  "/dealers",
  "/maintenance",
  "/team",
  "/grievances",
  "/lead-import",
  "/ingest",
  "/catalog",
  "/reports",
  "/accounts",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(STATIC_CACHE));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("rk-shell-") && !key.startsWith(VERSION))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

function isAppPath(pathname) {
  if (pathname === "/") return true;
  return APP_PREFIXES.some(
    (prefix) =>
      prefix !== "/" &&
      (pathname === prefix || pathname.startsWith(`${prefix}/`))
  );
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname === "/icon.svg" ||
    url.pathname === "/manifest.webmanifest"
  );
}

function isAppNavigation(request, url) {
  if (!isAppPath(url.pathname)) return false;
  if (request.method !== "GET") return false;
  if (request.mode === "navigate") return true;
  if (request.headers.get("RSC") === "1") return true;
  if (request.headers.get("Next-Router-Prefetch") === "1") return true;
  return false;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then(async (response) => {
      if (response && response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  if (cached) {
    void networkPromise;
    return cached;
  }
  const network = await networkPromise;
  if (network) return network;
  return new Response("Offline", { status: 503, statusText: "Offline" });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/portal")
  ) {
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  if (isAppNavigation(request, url)) {
    event.respondWith(staleWhileRevalidate(request, PAGE_CACHE));
  }
});
