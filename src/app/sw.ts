/// <reference lib="webworker" />

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkOnly, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: unknown }

const CACHE_VERSION = 'bambu-v4'

precacheAndRoute(self.__WB_MANIFEST)

cleanupOutdatedCaches()

// API: network-only — NEVER cache financial data
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkOnly()
)

// Images: cache-first, long-lived
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: `images-cache-${CACHE_VERSION}`,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 7 * 24 * 60 * 60,
      }),
    ],
  })
)

// Static assets: stale-while-revalidate
registerRoute(
  ({ url }) => url.pathname.startsWith('/_next/static/'),
  new StaleWhileRevalidate({
    cacheName: `static-cache-${CACHE_VERSION}`,
  })
)

// Navigation: network-first with offline fallback
const offlineHandler = createHandlerBoundToURL('/offline')
const navigationStrategy = new StaleWhileRevalidate({
  cacheName: `pages-cache-${CACHE_VERSION}`,
  plugins: [
    new ExpirationPlugin({
      maxEntries: 30,
      maxAgeSeconds: 7 * 24 * 60 * 60,
    }),
  ],
})
const navigationRoute = new NavigationRoute(navigationStrategy, {
  allowlist: [/^(?!\/api\/|_next)/],
})

registerRoute(navigationRoute)
navigationRoute.setCatchHandler(offlineHandler)

// Clean old caches on activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const currentCaches = [
        `images-cache-${CACHE_VERSION}`,
        `static-cache-${CACHE_VERSION}`,
        `pages-cache-${CACHE_VERSION}`,
      ]
      const keys = await caches.keys()
      const oldKeys = keys.filter(k => !currentCaches.includes(k))
      await Promise.all(oldKeys.map(k => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

// Controlled update: notify client, let it decide when to reload
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
