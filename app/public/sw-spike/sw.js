/* Day 11 POC: no app root registration. Scope restricted by register() to this folder. */
const VERSION = 'day11-v1';
const PREFIX = 'sketchyar-sw-spike-';
const CACHE_NAME = PREFIX + VERSION;
const SCOPE = self.registration.scope;
const files = ['index.html', 'spike.css', 'fixture.txt'].map(name => new URL(name, SCOPE).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(files)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith(PREFIX) && n !== CACHE_NAME).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin || !req.url.startsWith(SCOPE)) return;
  // Cache-first ONLY for the three declared shell files. All other requests are network-only.
  const lookup = req.url === SCOPE ? files[0] : req.url;
  if (!files.includes(lookup)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(lookup);
    return cached || fetch(req);
  })());
});
