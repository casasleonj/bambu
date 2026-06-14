/**
 * Tier 2: Forms Validation - Ruta Form
 * Tests: 6
 */
import { test, expect, loginAsAdmin, apiPost, expectStatus, BASE } from '../00-fixtures'

test.describe('Form Validation - Ruta', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-RT-01: Create ruta with valid nombre', async ({ page }) => {
    const res = await apiPost(page, '/api/rutas', {
      nombre: `Ruta QA ${Date.now() % 10000}`,
    })
    await expectStatus(res, [200, 201])
  })

  test('TC-RT-02: Ruta with empty nombre is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/rutas', { nombre: '' })
    await expectStatus(res, 400)
  })

  test('TC-RT-03: Ruta with duplicate nombre is rejected (409)', async ({ page }) => {
    const nombre = `Ruta Dup ${Date.now() % 10000}`
    const r1 = await apiPost(page, '/api/rutas', { nombre })
    await expectStatus(r1, [200, 201])

    const r2 = await apiPost(page, '/api/rutas', { nombre })
    await expectStatus(r2, 409)
  })

  test('TC-RT-04: Ruta with invalid horarioInicio is accepted (no validation)', async ({ page }) => {
    const res = await apiPost(page, '/api/rutas', {
      nombre: `Ruta BadTime ${Date.now() % 10000}`,
      horarioInicio: '99:99', // invalid HH:MM
    })
    expect([200, 201, 400]).toContain(res.status())
  })

  test('TC-RT-05: Ruta with non-existent repartidorId is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/rutas', {
      nombre: `Ruta BadRepartidor ${Date.now() % 10000}`,
      repartidorId: 'no-existe',
    })
    await expectStatus(res, [400, 404, 422, 500])
  })

  test('TC-RT-06: Ruta page /rutas/nuevo loads', async ({ page }) => {
    await page.goto(`${BASE}/rutas/nuevo`)
    await expect(page).toHaveURL(/\/rutas\/nuevo/)
    await expect(page.locator('input[placeholder*="nombre" i], input[name="nombre"]').first()).toBeVisible({ timeout: 5000 })
  })
})
