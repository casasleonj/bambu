/**
 * Tier 2: Forms Validation - Gasto Form
 * Tests: 6
 */
import { test, expect, loginAsAdmin, apiPost, expectStatus, BASE } from '../00-fixtures'

test.describe('Form Validation - Gasto', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-GS-01: Create gasto with valid data', async ({ page }) => {
    const res = await apiPost(page, '/api/gastos', {
      categoria: 'ARRIENDO',
      descripcion: 'Arriendo del local',
      monto: 1500000,
    })
    await expectStatus(res, [200, 201])
  })

  test('TC-GS-02: Gasto with all categories', async ({ page }) => {
    const cats = ['ARRIENDO', 'SERVICIOS', 'INSUMOS', 'MANTENIMIENTO', 'TRANSPORTE', 'NOMINA', 'OTRO']
    for (const categoria of cats) {
      const res = await apiPost(page, '/api/gastos', {
        categoria,
        descripcion: `Gasto de ${categoria}`,
        monto: 5000,
      })
      await expectStatus(res, [200, 201])
    }
  })

  test('TC-GS-03: Gasto with invalid categoria is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/gastos', {
      categoria: 'CATEGORIA_INVALIDA',
      descripcion: 'Test',
      monto: 1000,
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-GS-04: Gasto with empty descripcion is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/gastos', {
      categoria: 'OTRO',
      descripcion: '',
      monto: 1000,
    })
    await expectStatus(res, 400)
  })

  test('TC-GS-05: Gasto with negative monto is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/gastos', {
      categoria: 'OTRO',
      descripcion: 'Test',
      monto: -100,
    })
    await expectStatus(res, 400)
  })

  test('TC-GS-06: /gastos page loads', async ({ page }) => {
    await page.goto(`${BASE}/gastos`)
    await expect(page).toHaveURL(/\/gastos/)
    await expect(page.getByRole('heading', { name: /Gastos/ })).toBeVisible({ timeout: 5000 })
  })
})
