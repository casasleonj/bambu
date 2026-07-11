// @tests e2e/session-expiry
// Verifica que cuando la sesión expira, el cliente redirige automáticamente
// a /login con un banner informativo (no se queda congelado en la app).

import { test, expect } from '@playwright/test'

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

  test('auth:expired event redirects to login with expired banner', async ({ page }) => {
    // Login
    await page.goto('/login')
    await page.fill('input[type="text"]', 'admin')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button:has-text("Ingresar")')
    await expect(page).toHaveURL('/dashboard', { timeout: 5000 })

    // Navegar a página protegida
    await page.goto('/pedidos')
    await expect(page.locator('text=Lista de Pedidos')).toBeVisible()

    // Simular que un fetch recibió 401/403 y disparó el evento. Esto evita
    // esperar 60s de polling en CI.
    await page.evaluate((eventName) => {
      window.dispatchEvent(new CustomEvent(eventName, { detail: { statusCode: 401, url: '/api/pedidos' } }))
    }, AUTH_EXPIRED_EVENT)

    // Debe redirigir al login con ?reason=expired
    await expect(page).toHaveURL(/\/login\?reason=expired/, { timeout: 5000 })

    const banner = page.locator('[role="status"]')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('Tu sesión expiró')
  })

  test('inline 401 check in pedidos initial load redirects to login', async ({ page }) => {
    // Login
    await page.goto('/login')
    await page.fill('input[type="text"]', 'admin')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button:has-text("Ingresar")')
    await expect(page).toHaveURL('/dashboard', { timeout: 5000 })

    // Interceptar el fetch inicial de clientes para devolver 401
    await page.route('/api/clientes?all=true', async (route) => {
      await route.fulfill({ status: 401, body: JSON.stringify({ error: 'No autorizado' }) })
    })

    // Navegar a pedidos: el fetch directo detecta 401 y redirige
    await page.goto('/pedidos')

    await expect(page).toHaveURL(/\/login\?reason=expired/, { timeout: 5000 })
  })

  test('login form remains focusable after Suspense refactor', async ({ page }) => {
    await page.goto('/login?reason=expired')

    await expect(page.locator('input#login-username')).toBeVisible()
    await page.focus('input#login-username')
    await expect(page.locator('input#login-username')).toBeFocused()
  })
})
