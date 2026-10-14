const SHELL_CACHE = 'neonkat-shell-v3';
const TRACK_CACHE = 'neonkat-tracks-v1';
const STATIC_ASSETS = ['/build/kat.png', '/manifest.json', '/build/bars.gif'];

async function serveCachedAudio(req) {
  const cache = await caches.open(TRACK_CACHE);
  const res = await cache.match(req.url);
  if (!res) return new Response('Not cached', { status: 404 });

  const blob = await res.blob();
  const size = blob.size;
  const type = blob.type || res.headers.get('Content-Type') || 'audio/mpeg';
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');

  if (!m) {
    return new Response(blob, { status: 200, headers: {
      'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes'
    }});
  }
  if (!m[1] && !m[2]) return new Response(null, { status: 416 });

  let start = m[1] ? parseInt(m[1], 10) : Math.max(0, size - parseInt(m[2], 10));
  let end = m[1] && m[2] ? parseInt(m[2], 10) : size - 1;
  end = Math.min(end, size - 1);
  if (start > end || start >= size) {
    return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
  }

  return new Response(blob.slice(start, end + 1, type), { status: 206, headers: {
    'Content-Type': type,
    'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
    'Content-Length': end - start + 1,
    'Accept-Ranges': 'bytes'
  }});
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(['/', ...STATIC_ASSETS])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.startsWith('neonkat-shell-') && k !== SHELL_CACHE)
          .map(k => caches.delete(k))
    );
    await clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          if (r.ok) caches.open(SHELL_CACHE).then(c => c.put('/', r.clone()));
          return r;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  if (STATIC_ASSETS.includes(url.pathname)) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
    return;
  }

  if (url.pathname === '/api/playlist') {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          if (r.ok) caches.open(SHELL_CACHE).then(c => c.put(e.request, r.clone()));
          return r;
        })
        .catch(async () =>
          (await caches.match(e.request)) ||
          new Response('{"tracks":[]}', { status: 503, headers: { 'Content-Type': 'application/json' } })
        )
    );
    return;
  }

  if (url.pathname.startsWith('/offline/') && url.pathname.endsWith('/stream')) {
  e.respondWith(serveCachedAudio(e.request));
  return;
}
});