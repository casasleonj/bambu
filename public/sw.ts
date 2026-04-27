const CACHE_NAME = 'bambu-v1';
const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/pedidos',
  '/clientes',
  '/precios',
  '/offline',
];

self.addEventListener('install', (event: any) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  (self as any).skipWaiting();
});

self.addEventListener('activate', (event: any) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  (self as any).clients.claim();
});

self.addEventListener('fetch', (event: any) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('/offline');
          }
        });
    })
  );
});

self.addEventListener('sync', (event: any) => {
  if (event.tag === 'sync-pedidos') {
    event.waitUntil(
      (self as any).clients.matchAll({ type: 'window' }).then((clients: any[]) => {
        for (const client of clients) {
          client.postMessage({ type: 'TRIGGER_SYNC' });
        }
      })
    );
  }
});
