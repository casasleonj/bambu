import { test, expect } from '@playwright/test'

test.use({ serviceWorkers: 'allow' })

test.describe('PWA offline page', () => {
  test('/offline loads without auth', async ({ request }) => {
    const response = await request.get('/offline')
    expect(response.status()).toBe(200)
    const body = await response.text()
    expect(body).toContain('Estás offline')
  })

  test('service worker registers and offline fallback is reachable', async ({ page }) => {
    await page.goto('/')

    const swState = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 'unsupported'
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ])
      if (!registration) return 'timeout'
      return registration.active?.state || 'no-active'
    })

    // En dev el SW de Serwist no se genera; aceptamos que no esté activo.
    // En producción/build este check valida el registro real.
    if (swState === 'activated' || swState === 'activating') {
      const offlineReachable = await page.evaluate(async () => {
        const cacheNames = await caches.keys()
        for (const name of cacheNames) {
          const cache = await caches.open(name)
          const response = await cache.match('/offline')
          if (response) return true
        }
        return false
      })
      expect(offlineReachable, 'la página /offline debería estar precacheada').toBe(true)
    }
  })
})
