const CACHE_NAME = "collab-editor-v4";
const OFFLINE_SHELLS = [
  "/offline-dashboard.html",
  "/offline-document.html",
  "/offline-fallback.html",
];

async function putInCache(request, response) {
  if (!response || !response.ok) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}

async function matchNavigation(pathname) {
  const cache = await caches.open(CACHE_NAME);
  const requests = await cache.keys();
  for (const cachedRequest of requests) {
    try {
      const cachedUrl = new URL(cachedRequest.url);
      if (cachedUrl.pathname === pathname) {
        const hit = await cache.match(cachedRequest);
        if (hit) return hit;
      }
    } catch {
      // Ignore malformed cache keys
    }
  }
  return caches.match(`${self.location.origin}${pathname}`);
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_SHELLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API calls — stale 404/200 responses break online sync.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/favicon")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          void putInCache(request, response);
          return response;
        });
      })
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          void putInCache(request, response);
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;

          if (url.pathname === "/dashboard") {
            const dashboard = await matchNavigation("/dashboard");
            if (dashboard) return dashboard;
            return caches.match("/offline-dashboard.html");
          }

          if (/^\/documents\/[^/]+$/.test(url.pathname)) {
            const documentPage = await matchNavigation(url.pathname);
            if (documentPage) return documentPage;
            return caches.match("/offline-document.html");
          }

          const dashboard = await matchNavigation("/dashboard");
          if (dashboard) return dashboard;
          return caches.match("/offline-fallback.html");
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        void putInCache(request, response);
        return response;
      });
    })
  );
});
