// @tests C-6: REPARTIDOR NO debe poder ver /api/cierre/last (info financiera agregada)
// Hallazgo: el endpoint solo tenía requireAuth, sin rol
import { test, expect, loginAs, apiGet, BASE } from '../fixtures'
// `apiGet` is used in tests below

test.describe('Security Fix: Cierre Last requiere rol con acceso financiero', () => {
  test('REPARTIDOR recibe 403 al intentar ver el último cierre', async ({ page }) => {
    await loginAs(page, 'repartidor')

    const res = await apiGet(page, '/api/cierre/last')

    // Antes del fix: 200 (cualquiera podía ver)
    // Después del fix: 403
    expect(res.status()).toBe(403)
  })

  test('SELLADOR recibe 403 al intentar ver el último cierre', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'sellador')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'sell123')
    await page.click('button[type="submit"]')
    await page.waitForTimeout(2000)

    const res = await apiGet(page, '/api/cierre/last')
    expect(res.status()).toBe(403)
  })
})
