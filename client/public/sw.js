// Service worker básico de Fish Poker: precachea el shell y cachea en
// runtime los assets del mismo origen. Nunca toca /socket.io (tiempo real).
const CACHE = 'fish-poker-v4';
const PRECACHE = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/cover.jpg'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/socket.io') || url.pathname === '/health') return;
  if (url.origin !== location.origin) return;

  // HTML siempre network-first: si hay una versión nueva de la app, se usa;
  // el cache queda solo como respaldo offline.
  if (e.request.mode === 'navigate' || url.pathname === '/index.html') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request).then((hit) => hit || caches.match('/')))
    );
    return;
  }

  // Assets (con hash en el nombre): cache-first
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
    )
  );
});
