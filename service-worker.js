/* Family Budget — Service Worker (PWA)
 * - Works on GitHub Pages at root or subpaths
 * - Caches core assets for offline
 * - Network-first for HTML, cache-first for static
 */

const VERSION = 'v1.0.2';
const CACHE_NAME = `family-budget-${VERSION}`;

const CORE_ASSETS = [
  p(''),
  p('index.html'),
  p('styles.css'),
  p('app.js'),
  p('manifest.json'),
  p('familybudget-icon-192x192-v3.png'),
  p('familybudget-icon-512x512-v3.png')
];
// INSTALL: pre-cache core
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
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

// FETCH strategy:
// - HTML/doc requests: network-first, fall back to cached index
// - Other requests: cache-first, then network, then cached fallback if available
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  const acceptsHTML =
    (req.headers.get('accept') || '').includes('text/html') ||
    req.mode === 'navigate';

  if (acceptsHTML) {
    // Network-first for pages
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          // update cache entry for index.html (navigation fallback)
          caches.open(CACHE_NAME).then((c) => c.put(p('index.html'), copy));
          return resp;
        })
        .catch(() =>
          // fallback to cached index.html
          caches.match(p('index.html')).then((r) => r || new Response('Offline', { status: 503 }))
        )
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((resp) => {
          // Cache successful GETs
          if (resp && resp.ok && req.method === 'GET') {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return resp;
        })
        .catch(() => cached); // if fetch fails and we had nothing cached
    })
  );
});
