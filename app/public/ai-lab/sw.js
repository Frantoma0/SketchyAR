/* Day 32.1 standalone lab SW. Never controls the SketchyAR editor or camera. */
const SHELL = 'sketchyar-ai-lab-shell-v2';
const FILES = ['./', './index.html', './lab.js', './bench-utils.mjs', './sw.js'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('sketchyar-ai-lab-shell-') && k !== SHELL).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(new URL('./', self.location.href).pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const hit = await cache.match(request, { ignoreSearch: true });
    // Online-first for the lab code so deployed safety fixes are not trapped by
    // an older cache-first service worker after a subsequent navigation.
    {
      try {
        const fresh = await fetch(request);
        if (fresh.ok) { await cache.put(request, fresh.clone()); return fresh; }
      } catch { /* offline fallback */ }
    }
    if (hit) return hit;
    return fetch(request);
  })());
});
