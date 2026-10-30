// Golf Improvement App — service worker: makes the app installable and lets it run with no connection.
// Every app file is fetched fresh when the network answers quickly (so changes show up at once)
// and a copy is kept; with no network, or a slow one (on the course), the copy is used.
// The file list is read from the page itself, so new scripts are picked up without editing this.
const CACHE = 'golf-app-v1';
const PAGE = 'golf-improvement-app';
const EXTRA = ['golf.webmanifest', 'golf/icons/icon-192.png', 'golf/icons/icon-512.png', 'golf/icons/maskable-512.png',
  'golf/vendor/three/three.min.js', 'golf/vendor/three/shaders/CopyShader.js', 'golf/vendor/three/shaders/LuminosityHighPassShader.js',
  'golf/vendor/three/postprocessing/EffectComposer.js', 'golf/vendor/three/postprocessing/RenderPass.js',
  'golf/vendor/three/postprocessing/ShaderPass.js', 'golf/vendor/three/postprocessing/UnrealBloomPass.js'];
const NETWORK_WAIT_MS = 2500;

self.addEventListener('install', e => e.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  const res = await fetch(PAGE, { cache: 'no-cache' });
  const html = await res.clone().text();
  await cache.put(PAGE, res);
  const files = [...html.matchAll(/(?:src|href)="(golf\/[^"]+)"/g)].map(m => m[1]);
  await cache.addAll([...new Set([...files, ...EXTRA])].map(f => new Request(f, { cache: 'no-cache' })));
  self.skipWaiting();
})()));
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

// Only the app's own files; anything else on this site is left alone
function appKey(url) {
  const base = new URL('./', self.registration.scope).pathname, p = url.pathname;
  if (url.origin !== location.origin || !p.startsWith(base)) return null;
  const rel = p.slice(base.length);
  if (rel === PAGE || rel === PAGE + '.html') return PAGE;
  return rel.startsWith('golf/') || rel === 'golf.webmanifest' ? rel : null;
}
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const key = appKey(new URL(e.request.url));
  if (!key) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const net = fetch(key, { cache: 'no-cache' }).then(r => { if (r.ok && !r.redirected) cache.put(key, r.clone()); return r; });
    const cached = await cache.match(key);
    if (!cached) return net;
    const timeout = new Promise(res => setTimeout(() => res(cached), NETWORK_WAIT_MS));
    return Promise.race([net.catch(() => cached), timeout]);
  })());
});
