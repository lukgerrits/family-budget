/* Family Budget — Service Worker (PWA)
 * - Works on GitHub Pages (root or /family-budget/)
 * - Network-first for HTML (with navigation preload)
 * - Stale-while-revalidate for static assets
 * - No pinning of app.js (so new JS deploys show up)
 */

const VERSION = 'v1.0.4'; // ⬅️ bump on each deploy
const PRECACHE = `family-budget-precache-${VERSION}`;
const RUNTIME  = `family-budget-runtime-${VERSION}`;

// Resolve paths relative to the SW scope (handles GitHub Pages subpath)
const basePath = new URL(self.registration.scope).pathname.replace(/\/+$/, '') || '';
const p = (path) => {
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return `${basePath}/${clean}`;
};

// Core assets to pre-cache (keep light; do NOT include app.js)
const CORE_ASSETS = [
  p(''),
  p('index.html'),
  p('styles.css'),
  p('manifest.json'),
  p('familybudget-icon-192x192-v3.png'),
  p('familybudget-icon-512x512-v3.png')
];

/* ---------------- Install ---------------- */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    for (const url of CORE_ASSETS) {
      try { await cache.add(url); } catch (e) { /* ignore 404s */ }
    }
  })());
  self.skipWaiting();
});

/* ---------------- Activate ---------------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Clean old caches
    const names = await caches.keys();
    await Promise.all(names
      .filter((n) => n !== PRECACHE && n !== RUNTIME)
      .map((n) => caches.delete(n)));

    // Enable navigation preload if available
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
  })());
  self.clients.claim();
});

// Allow page to trigger an immediate takeover after update
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

/* ---------------- Fetch ---------------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only same-origin
  if (url.origin !== self.location.origin) return;

  const isHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  // HTML/pages: Network-first with preload, fallback to cached index, then offline text
  if (isHTML) {
    event.respondWith((async () => {
      try {
        // Use navigation preload response if available for faster first paint
        const preload = await event.preloadResponse;
        if (preload) {
          // Keep index.html fresh in precache (for offline nav fallback)
          caches.open(PRECACHE).then((c) => c.put(p('index.html'), preload.clone())).catch(()=>{});
          return preload;
        }

        const net = await fetch(req);
        caches.open(PRECACHE).then((c) => c.put(p('index.html'), net.clone())).catch(()=>{});
        return net;
      } catch {
        const cachedIndex = await caches.match(p('index.html'));
        return cachedIndex || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // Static assets: Stale-while-revalidate
  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME);
    const cached = await cache.match(req);
    const fetchAndUpdate = fetch(req).then((resp) => {
      if (resp && resp.ok && req.method === 'GET') {
        cache.put(req, resp.clone()).catch(()=>{});
      }
      return resp;
    }).catch(() => undefined);

    // If we have a cached copy, return it immediately and update in background
    if (cached) {
      event.waitUntil(fetchAndUpdate);
      return cached;
    }

    // Otherwise, go to network then cache
    const resp = await fetchAndUpdate;
    return resp || new Response('', { status: 504, statusText: 'Gateway Timeout' });
  })());
});
