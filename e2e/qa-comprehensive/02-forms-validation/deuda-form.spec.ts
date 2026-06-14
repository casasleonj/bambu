/**
 * Tier 2: Forms Validation - Deuda Trabajador Form
 * Tests: 5
 */
import { test, expect, loginAsAdmin, apiPost, expectStatus, BASE, apiGet } from '../00-fixtures'

test.describe('Form Validation - Deuda Trabajador', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-DT-01: Create deuda with valid data', async ({ page }) => {
    const t = (await (await apiGet(page, '/api/trabajadores?activo=true')).json()).trabajadores?.[0]
    if (!t) { test.skip(); return }

    const res = await apiPost(page, '/api/deudas', {
      trabajadorId: t.id,
      tipo: 'PRESTAMO',
      monto: 50000,
      descripcion: 'Test prestamo',
    })
    await expectStatus(res, [200, 201])
  })

  test('TC-DT-02: Deuda with negative monto is rejected', async ({ page }) => {
    const t = (await (await apiGet(page, '/api/trabajadores?activo=true')).json()).trabajadores?.[0]
    if (!t) { test.skip(); return }

    const res = await apiPost(page, '/api/deudas', {
      trabajadorId: t.id,
      tipo: 'PRESTAMO',
      monto: -1000,
      descripcion: 'Test',
    })
    await expectStatus(res, 400)
  })

  test('TC-DT-03: Deuda with invalid tipo is rejected', async ({ page }) => {
    const t = (await (await apiGet(page, '/api/trabajadores?activo=true')).json()).trabajadores?.[0]
    if (!t) { test.skip(); return }

    const res = await apiPost(page, '/api/deudas', {
      trabajadorId: t.id,
      tipo: 'NOEXISTE',
      monto: 1000,
      descripcion: 'Test',
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-DT-04: Deuda with empty descripcion is rejected', async ({ page }) => {
    const t = (await (await apiGet(page, '/api/trabajadores?activo=true')).json()).trabajadores?.[0]
    if (!t) { test.skip(); return }

    const res = await apiPost(page, '/api/deudas', {
      trabajadorId: t.id,
      tipo: 'PRESTAMO',
      monto: 1000,
      descripcion: '',
    })
    await expectStatus(res, 400)
  })

  test('TC-DT-05: /deudas page loads', async ({ page }) => {
    await page.goto(`${BASE}/deudas`)
    await expect(page).toHaveURL(/\/deudas/)
    await expect(page.getByRole('heading', { name: /Deudas/ })).toBeVisible({ timeout: 5000 })
  })
})
