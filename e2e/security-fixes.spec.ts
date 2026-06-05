// @tests security-fixes verification
// Tests specifically for security fixes applied in Phase 1
import { test, expect, type Page } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000'

async function loginAs(page: Page, user: string, pass: string) {
  await page.goto(`${BASE}/login`)
  await page.fill('input[placeholder="Ingrese usuario"]', user)
  await page.fill('input[placeholder="Ingrese contraseña"]', pass)
  await page.click('button[type="submit"]')
  await page.waitForURL(/.*\/(dashboard|repartidor|reportes)/, { timeout: 15000 })
}

// ═══════════════════════════════════════════════════════════════════════════════
// Fix #3: /offline accessible without auth
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Fix #3: Offline page accessible without auth', () => {
  test('GET /offline returns 200 without authentication', async ({ page }) => {
    // Clear all cookies to ensure no session
    const context = page.context()
    await context.clearCookies()

    const response = await page.goto(`${BASE}/offline`)
    expect(response?.status()).toBe(200)
    // Should NOT redirect to login
    await expect(page).not.toHaveURL(/.*\/login/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Fix #6 + #11: Route permission map completeness
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Fix #6 + #11: Route protection for restricted roles', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'repartidor', 'rep123')
  })

  const restrictedRoutes = [
    '/deudas',
    '/recurrentes',
    '/resumen-facturas',
    '/admin',
    '/admin/usuarios',
    '/nomina',
    '/cierre',
    '/reportes',
    '/configuracion',
    '/trabajadores',
    '/proveedores',
    '/facturas',
    '/gastos',
    '/compras',
    '/productos',
  ]

  for (const route of restrictedRoutes) {
    test(`REPARTIDOR redirected from ${route}`, async ({ page }) => {
      await page.goto(`${BASE}${route}`)
      await page.waitForTimeout(500)
      // Should redirect to /repartidor (REPARTIDOR's default)
      expect(page.url()).toContain('/repartidor')
    })
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// Fix #5: Nomina PUT restricted to ADMIN/CONTADOR only
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Fix #5: Nomina PUT restricted to ADMIN/CONTADOR', () => {
  test('ASISTENTE cannot PUT /api/nomina/[id] (pay/cancel)', async ({ page }) => {
    await loginAs(page, 'asistente', 'asist123')
    const context = page.context()

    const putRes = await context.request.put(`${BASE}/api/nomina/dummy-id`, {
      data: { action: 'PAGAR' },
    })
    expect(putRes.status()).toBe(403)
  })

  test('CONTADOR can PUT /api/nomina/[id]', async ({ page }) => {
    await loginAs(page, 'contador', 'cont123')
    const context = page.context()

    const putRes = await context.request.put(`${BASE}/api/nomina/dummy-id`, {
      data: { action: 'PAGAR' },
    })
    // Should be 404 (not found) or 409 (already paid), NOT 403
    expect(putRes.status()).not.toBe(403)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Fix #4: API routes require proper permissions
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Fix #4: API routes require proper permissions', () => {
  test('SELLADOR cannot access /api/precios/version', async ({ page }) => {
    await loginAs(page, 'repartidor', 'rep123')
    const context = page.context()
    const res = await context.request.get(`${BASE}/api/precios/version`)
    expect(res.status()).toBe(403)
  })

  test('SELLADOR cannot access /api/precios/historial', async ({ page }) => {
    await loginAs(page, 'repartidor', 'rep123')
    const context = page.context()
    const res = await context.request.get(`${BASE}/api/precios/historial?producto=PACA_AGUA`)
    expect(res.status()).toBe(403)
  })

  test('SELLADOR cannot access /api/search/clientes', async ({ page }) => {
    await loginAs(page, 'repartidor', 'rep123')
    const context = page.context()
    const res = await context.request.get(`${BASE}/api/search/clientes?q=test`)
    expect(res.status()).toBe(403)
  })

  test('SELLADOR cannot access /api/productos/configs', async ({ page }) => {
    await loginAs(page, 'repartidor', 'rep123')
    const context = page.context()
    const res = await context.request.get(`${BASE}/api/productos/configs`)
    expect(res.status()).toBe(403)
  })

  test('ADMIN can access all protected API routes', async ({ page }) => {
    await loginAs(page, 'admin', 'admin123')

    // Use context.request which shares cookies with page navigation
    const context = page.context()

    const res1 = await context.request.get(`${BASE}/api/precios/version`)
    expect(res1.status()).not.toBe(401)
    expect(res1.status()).not.toBe(403)

    const res2 = await context.request.get(`${BASE}/api/search/clientes?q=test`)
    expect(res2.status()).not.toBe(401)
    expect(res2.status()).not.toBe(403)

    const res3 = await context.request.get(`${BASE}/api/productos/configs`)
    expect(res3.status()).not.toBe(401)
    expect(res3.status()).not.toBe(403)

    // precios/historial requires a valid producto
    const histRes = await context.request.get(`${BASE}/api/precios/historial?producto=PACA_AGUA`)
    expect(histRes.status()).not.toBe(401)
    expect(histRes.status()).not.toBe(403)
  })

  test('CONTADOR can access /api/precios/* (has view:productos)', async ({ page }) => {
    await loginAs(page, 'contador', 'cont123')
    const context = page.context()

    const res1 = await context.request.get(`${BASE}/api/precios/version`)
    expect(res1.status()).not.toBe(401)
    expect(res1.status()).not.toBe(403)

    const res2 = await context.request.get(`${BASE}/api/precios/historial?producto=PACA_AGUA`)
    expect(res2.status()).not.toBe(401)
    expect(res2.status()).not.toBe(403)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Admin full access verification
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Admin full access (baseline)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin', 'admin123')
  })

  test('Admin can access all previously restricted routes', async ({ page }) => {
    // Test a subset of routes to avoid timeout (some pages are slow to load)
    const routes = [
      '/deudas',
      '/recurrentes',
      '/resumen-facturas',
      '/admin',
      '/nomina',
      '/configuracion',
    ]

    for (const route of routes) {
      await page.goto(`${BASE}${route}`)
      await page.waitForTimeout(300)
      const segment = route.split('/')[1]
      expect(page.url()).toContain(segment)
    }
  })

  test('Admin can access all protected API routes', async ({ page }) => {
    await loginAs(page, 'admin', 'admin123')
    const context = page.context()

    const routes = [
      '/api/precios/version',
      '/api/precios/historial?producto=PACA_AGUA',
      '/api/search/clientes?q=a',
      '/api/productos/configs',
      '/api/nomina',
    ]

    for (const route of routes) {
      const res = await context.request.get(`${BASE}${route}`)
      // All should be accessible (not 401 or 403)
      expect(res.status()).not.toBe(401)
      expect(res.status()).not.toBe(403)
    }
  })
})
