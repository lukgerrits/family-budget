/* Family Budget — Service Worker (PWA)
 * - Works on GitHub Pages (root or /family-budget/)
 * - Network-first for HTML (with navigation preload)
 * - Network-first for JS (so new deploys show immediately)
 * - Stale-while-revalidate for static assets (CSS, images, manifest)
 */

const VERSION = 'v1.0.18'; // ⬅️ bump this on every deploy
const PRECACHE = `family-budget-precache-${VERSION}`;
const RUNTIME  = `family-budget-runtime-${VERSION}`;

// Resolve paths relative to SW scope (handles /family-budget/ on GitHub Pages)
const basePath = new URL(self.registration.scope).pathname.replace(/\/+$/, '') || '';
const p = (path) => {
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return `${basePath}/${clean}`;
};

// Core assets to pre-cache (keep small; no JS files!)
const CORE_ASSETS = [
  p(''),
  p('index.html'),
  p('styles.css'),
  p('manifest.json'),
  p('familybudget-icon-192x192-v3.png'),
  p('familybudget-icon-512x512-v3.png')
];

/* ---------------- INSTALL ---------------- */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    for (const url of CORE_ASSETS) {
      try { await cache.add(url); } catch { /* ignore missing files */ }
    }
  })());
  self.skipWaiting();
});

/* ---------------- ACTIVATE ---------------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((n) => n !== PRECACHE && n !== RUNTIME)
      .map((n) => caches.delete(n)));

    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
  })());
  self.clients.claim();
});

/* ---------------- MESSAGE ---------------- */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

/* ---------------- FETCH ---------------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  // 1) HTML: network-first
  if (isHTML) {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) {
          caches.open(PRECACHE).then(c => c.put(p('index.html'), preload.clone())).catch(()=>{});
          return preload;
        }
        const net = await fetch(req, { cache: 'no-store' });
        caches.open(PRECACHE).then(c => c.put(p('index.html'), net.clone())).catch(()=>{});
        return net;
      } catch {
        const cached = await caches.match(p('index.html'));
        return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // 2) JS: always fetch fresh
  if (req.destination === 'script' || url.pathname.endsWith('.js')) {
    event.respondWith((async () => {
      try {
        return await fetch(req, { cache: 'no-store' });
      } catch {
        const cached = await caches.match(req);
        return cached || new Response('', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // 3) Other assets: stale-while-revalidate
  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME);
    const cached = await cache.match(req);

    const fetchAndUpdate = fetch(req).then((resp) => {
      const isScript = req.destination === 'script' || url.pathname.endsWith('.js');
      if (resp && resp.ok && req.method === 'GET' && !isScript) {
        cache.put(req, resp.clone()).catch(()=>{});
      }
      return resp;
    }).catch(() => undefined);

    if (cached) {
      event.waitUntil(fetchAndUpdate);
      return cached;
    }

    const resp = await fetchAndUpdate;
    return resp || new Response('', { status: 504, statusText: 'Gateway Timeout' });
  })());
});
