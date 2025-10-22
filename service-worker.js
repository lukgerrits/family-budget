/* Family Budget — Service Worker (PWA)
 * - Works on GitHub Pages (root or /family-budget/)
 * - Network-first for HTML, cache-first for static
 */

const VERSION = 'v1.0.3';                 // <-- bump this when you deploy
const CACHE_NAME = `family-budget-${VERSION}`;

// Resolve paths relative to the SW scope (handles GitHub Pages subpath)
const basePath = new URL(self.registration.scope).pathname.replace(/\/+$/, '') || '';
const p = (path) => {
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return `${basePath}/${clean}`;
};

// Core assets to pre-cache (NOTICE: app.js REMOVED so it won't be pinned)
const CORE_ASSETS = [
  p(''),
  p('index.html'),
  p('styles.css'),
  p('manifest.json'),
  p('familybudget-icon-192x192-v3.png'),
  p('familybudget-icon-512x512-v3.png')
];

// INSTALL: pre-cache core (ignore missing files instead of failing)
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      for (const url of CORE_ASSETS) {
        try { await cache.add(url); } catch (e) { /* ignore 404s */ }
      }
    })()
  );
  self.skipWaiting();
});

// ACTIVATE: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// FETCH:
// - HTML: network-first (fallback to cached index.html)
// - Static: cache-first, then network; cache successful GETs
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;

  const acceptsHTML =
    (req.headers.get('accept') || '').includes('text/html') || req.mode === 'navigate';

  if (acceptsHTML) {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(p('index.html'), copy));
          return resp;
        })
        .catch(() => caches.match(p('index.html')).then((r) => r || new Response('Offline', { status: 503 })))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((resp) => {
          if (resp && resp.ok && req.method === 'GET') {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return resp;
        })
        .catch(() => cached);
    })
  );
});
