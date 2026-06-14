/**
 * Tier 2: Forms Validation - Producto Form (Precios)
 * Tests: 6
 */
import { test, expect, loginAsAdmin, apiPost, expectStatus, BASE } from '../00-fixtures'

test.describe('Form Validation - Producto/Precios', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-PR-01: Get product list', async ({ page }) => {
    const res = await page.request.get(`${BASE}/api/productos`)
    await expectStatus(res, 200)
    const body = await res.json()
    expect(body.productos || body).toBeDefined()
  })

  test('TC-PR-02: Create precioVolumen with valid data', async ({ page }) => {
    // Get a product
    const prodRes = await page.request.get(`${BASE}/api/productos`)
    const prods = (await prodRes.json()).productos || []
    if (prods.length === 0) { test.skip(); return }
    const prod = prods[0]

    const res = await apiPost(page, '/api/precios', {
      productoId: prod.id,
      cantMin: 1,
      cantMax: 10,
      precio: 5000,
    })
    await expectStatus(res, [200, 201, 409])
  })

  test('TC-PR-03: Precio with negative precio is rejected', async ({ page }) => {
    const prodRes = await page.request.get(`${BASE}/api/productos`)
    const prods = (await prodRes.json()).productos || []
    if (prods.length === 0) { test.skip(); return }
    const prod = prods[0]

    const res = await apiPost(page, '/api/precios', {
      productoId: prod.id,
      cantMin: 1,
      precio: -100,
    })
    await expectStatus(res, 400)
  })

  test('TC-PR-04: Precio with cantMax < cantMin is rejected', async ({ page }) => {
    const prodRes = await page.request.get(`${BASE}/api/productos`)
    const prods = (await prodRes.json()).productos || []
    if (prods.length === 0) { test.skip(); return }
    const prod = prods[0]

    const res = await apiPost(page, '/api/precios', {
      productoId: prod.id,
      cantMin: 100,
      cantMax: 50, // < cantMin
      precio: 1000,
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-PR-05: Producto page /productos loads', async ({ page }) => {
    await page.goto(`${BASE}/productos`)
    await expect(page).toHaveURL(/\/productos/)
    await expect(page.getByRole('heading', { name: /Productos/ })).toBeVisible({ timeout: 5000 })
  })

  test('TC-PR-06: Precio historial endpoint', async ({ page }) => {
    const res = await page.request.get(`${BASE}/api/precios/historial`)
    expect([200, 403]).toContain(res.status())
  })
})
