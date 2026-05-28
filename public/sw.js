const CACHE_NAME = 'bambu-v3';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/offline',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Listen for SKIP_WAITING and PURGE_CACHE messages from the page
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'PURGE_CACHE') {
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => caches.delete(name))
      );
    });
  }
});

// Helper: determine request type
function getRequestType(request) {
  const url = new URL(request.url);
  
  if (request.mode === 'navigate') return 'navigate';
  if (url.pathname.startsWith('/_next/')) return 'static';
  if (url.pathname.startsWith('/api/')) return 'api';
  if (request.destination === 'image' || request.destination === 'font' || request.destination === 'style' || request.destination === 'script') {
    return 'static';
  }
  
  return 'other';
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const type = getRequestType(event.request);

  // API requests: always go to network, no cache
  if (type === 'api') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Static assets: cache-first with network fallback
  if (type === 'static') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        
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
            return new Response('Offline', { status: 503 });
          });
      })
    );
    return;
  }

  // Navigation requests: network-first with offline fallback (DO NOT cache authenticated HTML)
  if (type === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // Network failed — serve cached page if available, else offline page
          return caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return caches.match('/offline');
          });
        })
    );
    return;
  }

  // Other requests: network-first
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pedidos') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'TRIGGER_SYNC' });
        }
      })
    );
  }
});
