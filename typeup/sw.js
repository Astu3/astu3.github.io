// Network-first for the app itself (so updates show up right away when online),
// falling back to the cached copy when offline.
const CACHE = 'typeup-v2';
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/lessons.js',
  './js/passages.js',
  './js/badges.js',
  './js/app.js',
  './js/games.js',
  './manifest.json',
  './icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      // Only our own old caches: the other apps on this site keep theirs.
      .then(keys => Promise.all(keys.filter(k => k.startsWith('typeup-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(resp => {
      if (resp.ok) { const copy = resp.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return resp;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html')))
  );
});
