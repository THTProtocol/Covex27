// COVEX Service Worker.
//
// Strategy (fixes the stale-after-deploy bug): the HTML app shell is served
// NETWORK-FIRST so a new deploy is picked up on the very next load (the old SW
// cached index.html stale-while-revalidate, which pinned visitors to outdated
// content-hashed chunk references). Content-hashed /assets/ files are immutable,
// so they are cache-first (instant + offline). Bumping CACHE purges the old one.
//
// NGX-8: include wasm|bin|json so the ~11.5MB kaspa-wasm bundle (and its sidecar
// .bin/.json artifacts) is service-worker cached after the first load instead of
// re-downloaded every visit. Only files under /assets/ match, and Vite content-
// hashes everything there, so caching them cache-first stays immutable-safe;
// /manifest.json lives at the root and is handled by the shell path, not here.
const CACHE = 'covex-v6';
const ASSET_RE = /\/assets\/.+\.(?:js|css|woff2?|ttf|png|jpe?g|svg|webp|gif|ico|wasm|bin|json)$/i;

// Static app-shell pieces that make an installed PWA usable offline. These are
// NOT content-hashed, so we refresh them opportunistically (the fetch handler
// still serves /assets/* and index.html with their own strategies). We do NOT
// pre-cache index.html here: it must come fresh so the newest chunk hashes load.
const SHELL = ['/manifest.json', '/covex-logo-192.png', '/covex-logo-512.png', '/icon.svg'];

self.addEventListener('install', (event) => {
  // Pre-cache the install shell so an Add-to-Home-Screen launch works offline.
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL).catch(() => {})) // tolerate a missing asset
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // API: network-first, fall back to cache only when offline.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  // Immutable content-hashed assets: cache-first, then network+store on a miss.
  if (ASSET_RE.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached ||
        fetch(event.request).then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, clone));
          }
          return res;
        })
      )
    );
    return;
  }

  // App shell / navigations: NETWORK-FIRST so deploys are picked up immediately;
  // keep a cached copy only as an offline fallback.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.status === 200 && event.request.mode === 'navigate') {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((c) => c || caches.match('/index.html')))
  );
});
