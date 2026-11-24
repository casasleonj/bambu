// @tests e2e/session-expiry
// Verifica que cuando la sesión expira, el cliente redirige automáticamente
// a /login con un banner informativo (no se queda congelado en la app).

import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, skipBaseCaja } from './fixtures'

const db = new PrismaClient()
test.afterAll(() => db.$disconnect())

// Nombre hardcodeado para evitar importar TS en Playwright. Debe coincidir
// con AUTH_EXPIRED_EVENT en src/lib/auth-events.ts.
const AUTH_EXPIRED_EVENT = 'app:auth:expired'

test.describe('Session expiry client-side redirect', () => {
  test('login page shows amber expired banner when ?reason=expired', async ({ page }) => {
    await page.goto('/login?reason=expired')

    const banner = page.locator('[role="status"]')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('Tu sesión expiró')

    // El banner debe ser informativo (amber), no un error rojo.
    const className = await banner.evaluate((el) => el.className)
    expect(className).toContain('amber')
  })

  test('a revoked session plus auth:expired event redirects with an expired banner', async ({ page }) => {
    await skipBaseCaja(page)
    await login(page, 'admin', 'admin123')

    // Navegar a página protegida
    await page.goto('/pedidos')
    // Scoped a <main>: la copia transitoria del streaming SSR (fuera de <main>,
    // ver appMain en fixtures.ts) hace que el texto resuelva a 2 elementos.
    await expect(page.locator('main').locator('text=Lista de Pedidos')).toBeVisible()

    // Revoke the real server association: an event alone is not evidence of expiry.
    const session = await (await page.request.get('/api/auth/session')).json()
    expect(session.user.sessionId).toBeTruthy()
    await db.sesionActiva.deleteMany({ where: { sessionId: session.user.sessionId } })
    await page.evaluate((eventName) => {
      window.dispatchEvent(new CustomEvent(eventName, { detail: { statusCode: 401, url: '/api/pedidos' } }))
    }, AUTH_EXPIRED_EVENT)

    // Debe redirigir al login con ?reason=expired
    await expect(page).toHaveURL(/\/login\?reason=expired/, { timeout: 5000 })

    const banner = page.locator('[role="status"]')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('Tu sesión expiró')
  })

  test('a stale inline 401 does not log out a currently valid session', async ({ page }) => {
    await skipBaseCaja(page)
    await login(page, 'admin', 'admin123')

    // Interceptar el fetch inicial de clientes para devolver 401
    await page.route('/api/clientes?all=true', async (route) => {
      await route.fulfill({ status: 401, body: JSON.stringify({ error: 'No autorizado' }) })
    })

    let sawDeniedResponse = false
    page.on('response', response => {
      if (response.url().includes('/api/clientes?all=true') && response.status() === 401) sawDeniedResponse = true
    })
    const verified = page.waitForResponse(response => sawDeniedResponse && response.url().endsWith('/api/auth/session'))
    await page.goto('/pedidos')
    const session = await (await verified).json()
    expect(session.user.id).toBeTruthy()
    await expect(page).toHaveURL(/\/pedidos/)
    expect((await page.request.get('/api/config')).status()).toBe(200)
  })

  test('initial pedidos 401 after real revocation redirects to login', async ({ page }) => {
    await skipBaseCaja(page)
    await login(page, 'admin', 'admin123')
    const session = await (await page.request.get('/api/auth/session')).json()
    expect(session.user.sessionId).toBeTruthy()
    await page.route('/api/clientes?all=true', async route => {
      await db.sesionActiva.deleteMany({ where: { sessionId: session.user.sessionId } })
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'No autorizado' }) })
    })
    await page.goto('/pedidos')
    await expect(page).toHaveURL(/\/login\?reason=expired/)
  })

  test('login form remains focusable after Suspense refactor', async ({ page }) => {
    await page.goto('/login?reason=expired')

    await expect(page.locator('input#login-username')).toBeVisible()
    await page.focus('input#login-username')
    await expect(page.locator('input#login-username')).toBeFocused()
  })
})
