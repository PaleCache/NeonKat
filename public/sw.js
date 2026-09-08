
const SHELL_CACHE = 'neonkat-shell-v2';
const TRACK_CACHE = 'neonkat-tracks-v1';
const SHELL_ASSETS = ['/', '/build/kat.png', '/manifest.json', '/build/bars.gif'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  if (SHELL_ASSETS.includes(url.pathname)) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
    return;
  }

  if (url.pathname.startsWith('/api/stream/') || url.pathname.startsWith('/api/art/')) {
    e.respondWith(
      caches.open(TRACK_CACHE).then(async cache => {
        const byName = url.pathname.replace('/api/stream/', '/api/stream/byname/').replace('/api/art/', '/api/art/byname/');
        const namedMatch = await cache.match(byName);
        if (namedMatch) return namedMatch;
        return fetch(e.request).catch(() => new Response('', { status: 504 }));
      })
    );
    return;
  }

  if (url.pathname === '/api/playlist') {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          if (!response.ok) throw new Error('bad status ' + response.status);
          const clone = response.clone();
          caches.open(SHELL_CACHE).then(c => c.put(e.request, clone));
          return response;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(async cached => {
      if (cached) {
        fetch(e.request).then(response => {
          if (!response.ok) return;
          if (url.pathname === '/' || url.pathname === '/index.html') {
            caches.open(SHELL_CACHE).then(c => c.put(e.request, response.clone()));
          }
        }).catch(() => {});
        return cached;
      }

      try {
        const response = await fetch(e.request);
        if (!response.ok) throw new Error('bad status ' + response.status);
        if (url.pathname === '/' || url.pathname === '/index.html') {
          caches.open(SHELL_CACHE).then(c => c.put(e.request, response.clone()));
        }
        return response;
      } catch (err) {
        return (await caches.match('/')) || new Response('Offline', { status: 503 });
      }
    })
  );
});