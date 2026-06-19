import { test, expect } from '@playwright/test'

test.describe('PWA base', () => {
  test('manifest is reachable and valid', async ({ request }) => {
    const response = await request.get('/manifest.json')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('application/json')

    const manifest = await response.json()
    expect(manifest.name).toBe('Agua Bambú - Gestión de Pedidos')
    expect(manifest.short_name).toBe('Agua Bambú')
    expect(manifest.start_url).toBe('/')
    expect(manifest.display).toBe('standalone')
    expect(manifest.theme_color).toBe('#2563eb')
    expect(manifest.icons.length).toBeGreaterThan(0)
    expect(manifest.screenshots.length).toBeGreaterThan(0)
    expect(manifest.shortcuts.length).toBeGreaterThan(0)
  })

  test('manifest icons are reachable', async ({ request }) => {
    const manifestResponse = await request.get('/manifest.json')
    const manifest = await manifestResponse.json()

    for (const icon of manifest.icons) {
      const response = await request.get(icon.src)
      expect(response.status(), `icon ${icon.src} should be reachable`).toBe(200)
    }
  })

  test('manifest screenshots are reachable', async ({ request }) => {
    const manifestResponse = await request.get('/manifest.json')
    const manifest = await manifestResponse.json()

    for (const screenshot of manifest.screenshots) {
      const response = await request.get(screenshot.src)
      expect(response.status(), `screenshot ${screenshot.src} should be reachable`).toBe(200)
    }
  })

  test('apple touch icon is reachable', async ({ request }) => {
    const response = await request.get('/icons/apple-touch-icon.png')
    expect(response.status()).toBe(200)
  })

  test('badge icon is reachable', async ({ request }) => {
    const response = await request.get('/icons/badge-72x72.png')
    expect(response.status()).toBe(200)
  })
})
