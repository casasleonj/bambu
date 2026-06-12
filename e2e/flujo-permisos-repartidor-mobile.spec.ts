// @tests H3-4: REPARTIDOR bloqueado de páginas admin (móvil)
// Vector: permisos — un REPARTIDOR no debe poder ver data sensible de
// la franquicia, ni siquiera accediendo por URL directa.
// Verifica en viewport iPhone 13:
//   1. Login como REPARTIDOR
//   2. Intentar acceder por URL directa a /dashboard, /clientes, /cierre,
//      /embarques, /pedidos, /nomina, /facturas, /reportes
//   3. Cada URL redirige a /repartidor (proxy.ts bloquea)
//   4. Las APIs de admin devuelven 403 para REPARTIDOR
import { test, expect } from '@playwright/test'
import { loginAs, apiGet, apiPost, BASE } from './fixtures'

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 3,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Mobile/15E148 Safari/604.1',
})

const ADMIN_ONLY_PAGES = [
  '/dashboard',
  '/clientes',
  '/cierre',
  '/embarques',
  '/pedidos',
  '/nomina',
  '/facturas',
  '/reportes',
  '/trabajadores',
  '/gastos',
  '/configuracion',
]

test.describe('H3-4: REPARTIDOR bloqueado de páginas admin (iPhone 13)', () => {
  test('REPARTIDOR que entra por URL directa es redirigido a /repartidor', async ({ page }) => {
    await loginAs(page, 'repartidor')

    for (const path of ADMIN_ONLY_PAGES) {
      await page.goto(`${BASE}${path}`)
      // Esperar a que la navegación/redirección se complete
      await page.waitForLoadState('domcontentloaded')
      // El proxy debe redirigir a /repartidor
      expect(page.url(), `URL ${path} debería redirigir a /repartidor`).toMatch(/\/repartidor$/)
    }
  })

  test('API endpoints admin devuelven 403 o redirect para REPARTIDOR', async ({ page }) => {
    await loginAs(page, 'repartidor')

    // Intentar crear cliente
    const c = await apiPost(page, '/api/clientes', {
      nombre: 'No debería crearse',
      telefono: '3000000000',
    })
    // POST a /api/clientes sí está protegido (POST requiere rol)
    expect([401, 403]).toContain(c.status())

    // Intentar ver lista de clientes
    // FIX H3-4: GET /api/clientes ahora requiere rol [ADMIN, ASISTENTE, CONTADOR].
    // REPARTIDOR recibe 403.
    const list = await apiGet(page, '/api/clientes')
    expect(list.status()).toBe(403)
  })

  test('REPARTIDOR puede acceder a /repartidor (su vista)', async ({ page }) => {
    await loginAs(page, 'repartidor')
    await page.goto(`${BASE}/repartidor`)
    await page.waitForLoadState('domcontentloaded')
    // No debe redirigir a /login ni a otro lado
    expect(page.url()).toContain('/repartidor')
    // La página debe cargar (al menos un heading visible)
    const heading = page.locator('h1, h2, h3').first()
    await expect(heading).toBeVisible({ timeout: 5000 })
  })
})
