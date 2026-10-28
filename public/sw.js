// Küçük service worker: kurulabilirlik için gerekli; ağ önce, çevrim dışıysa önbellek.
const CACHE = 'degame-mobil-v1';
self.addEventListener('install', (e) => {
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => undefined);
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
