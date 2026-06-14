/**
 * Tier 2: Forms Validation - Insumo Form
 * Tests: 6
 */
import { test, expect, loginAsAdmin, apiPost, expectStatus, BASE } from '../00-fixtures'

test.describe('Form Validation - Insumo', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-IN-01: Create insumo with valid data', async ({ page }) => {
    const res = await apiPost(page, '/api/insumos', {
      nombre: `Insumo QA ${Date.now() % 10000}`,
      unidad: 'UNIDAD',
      stock: 100,
      stockMin: 10,
      precioUnit: 1000,
    })
    await expectStatus(res, [200, 201])
  })

  test('TC-IN-02: Insumo with empty nombre is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/insumos', { nombre: '' })
    await expectStatus(res, 400)
  })

  test('TC-IN-03: Insumo with invalid unidad is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/insumos', {
      nombre: `Insumo ${Date.now() % 10000}`,
      unidad: 'UNIDAD_INVALIDA',
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-IN-04: Insumo with negative stock is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/insumos', {
      nombre: `Insumo ${Date.now() % 10000}`,
      stock: -100,
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-IN-05: Insumo with all unidades', async ({ page }) => {
    const unidades = ['UNIDAD', 'LITRO', 'KG', 'PACA', 'BOLSA', 'CAJA', 'MTS', 'GALON']
    for (const unidad of unidades) {
      const res = await apiPost(page, '/api/insumos', {
        nombre: `Insumo ${unidad} ${Date.now() % 10000}`,
        unidad,
      })
      await expectStatus(res, [200, 201])
    }
  })

  test('TC-IN-06: Insumo page /insumos loads', async ({ page }) => {
    await page.goto(`${BASE}/insumos`)
    await expect(page).toHaveURL(/\/insumos/)
    await expect(page.getByRole('heading', { name: /Insumos/ })).toBeVisible({ timeout: 5000 })
  })
})
