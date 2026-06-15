// COVEX Service Worker.
//
// Strategy (fixes the stale-after-deploy bug): the HTML app shell is served
// NETWORK-FIRST so a new deploy is picked up on the very next load (the old SW
// cached index.html stale-while-revalidate, which pinned visitors to outdated
// content-hashed chunk references). Content-hashed /assets/ files are immutable,
// so they are cache-first (instant + offline). Bumping CACHE purges the old one.
const CACHE = 'covex-v2';
const ASSET_RE = /\/assets\/.+\.(?:js|css|woff2?|ttf|png|jpe?g|svg|webp|gif|ico)$/i;

self.addEventListener('install', () => {
  // Do NOT pre-cache index.html: it must always come fresh from the network so
  // the newest chunk hashes are referenced after a deploy.
  self.skipWaiting();
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
