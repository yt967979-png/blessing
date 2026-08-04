// v2: navigations (HTML) are network-first so a redeploy is picked up immediately —
// Next.js re-hashes /_next/static/* on every build (cleanDistDir) and deletes the old
// files, so serving a stale cached HTML shell makes the browser request chunk files
// that no longer exist (text/plain 404 from Next's static-asset 404 handler).
// Bumping CACHE_NAME also purges the old v1 cache (which held stale HTML) on activate.
const CACHE_NAME = 'blessing-pwa-v2';
const STATIC_ASSETS = [
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // HTML navigations: always go to the network first so users get the current
  // build's page (and its correct, currently-existing chunk hashes). Only fall
  // back to a cached page when fully offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse.clone()));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Hashed build assets (/_next/static/*) are immutable — cache-first is safe and fast.
  // Anything not already cached is fetched fresh from the network (current build only).
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
