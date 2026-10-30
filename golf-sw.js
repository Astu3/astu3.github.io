// Golf Improvement App — service worker: makes the app installable and lets it run with no connection.
// Each version of the app is cached whole, under a name stamped from the files' contents
// (tools/stamp-sw.js), and the app runs from that cache — so it never mixes files from
// two versions. A new version downloads in the background, then waits: the app offers
// "Update" and it takes over on reload. On localhost (development) files come from the
// network first, so edits show up at once.
const VERSION = 'd7228acab6a4';
const CACHE = 'golf-app-' + VERSION;
const PAGE = 'golf-improvement-app';
const EXTRA = ['golf.webmanifest', 'golf/icons/icon-192.png', 'golf/icons/icon-512.png', 'golf/icons/maskable-512.png',
  'golf/vendor/three/three.min.js', 'golf/vendor/three/shaders/CopyShader.js', 'golf/vendor/three/shaders/LuminosityHighPassShader.js',
  'golf/vendor/three/postprocessing/EffectComposer.js', 'golf/vendor/three/postprocessing/RenderPass.js',
  'golf/vendor/three/postprocessing/ShaderPass.js', 'golf/vendor/three/postprocessing/UnrealBloomPass.js'];
const DEV = ['localhost', '127.0.0.1'].includes(location.hostname);

self.addEventListener('install', e => e.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  const res = await fetch(PAGE, { cache: 'no-cache' });
  if (!res.ok) throw new Error('page fetch failed');
  const html = await res.clone().text();
  const files = [...html.matchAll(/(?:src|href)="(golf\/[^"]+)"/g)].map(m => m[1]);
  await cache.addAll([...new Set([...files, ...EXTRA])].map(f => new Request(f, { cache: 'no-cache' })));
  await cache.put(PAGE, res);
  // the first worker (golf-app-v1) had no update prompt, so replace it straight away
  if (DEV || await caches.has('golf-app-v1')) self.skipWaiting();
})()));
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('golf-app-') && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('message', e => { if (e.data === 'skip-waiting') self.skipWaiting(); });

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
    if (DEV) { // development: newest first, the copy if offline
      try { const r = await fetch(key, { cache: 'no-cache' }); if (r.ok && !r.redirected) cache.put(key, r.clone()); return r; }
      catch (err) { const c = await cache.match(key); if (c) return c; throw err; }
    }
    const cached = await cache.match(key);
    if (cached) return cached;
    const r = await fetch(key); // not in this version's set (shouldn't happen): fetch and keep it
    if (r.ok && !r.redirected) cache.put(key, r.clone());
    return r;
  })());
});
