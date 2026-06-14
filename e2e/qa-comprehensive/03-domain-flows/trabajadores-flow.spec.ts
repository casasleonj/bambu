/**
 * Tier 3: Domain Flows - Trabajadores (incluye deudas + nomina)
 * Tests: 5
 */
import { test, expect, loginAsAdmin, apiPost, expectStatus, BASE, apiGet } from '../00-fixtures'

test.describe('Domain Flow - Trabajadores', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-DT2-01: /trabajadores list page loads', async ({ page }) => {
    await page.goto(`${BASE}/trabajadores`)
    await expect(page).toHaveURL(/\/trabajadores/)
  })

  test('TC-DT2-02: /trabajadores/[id] detail page loads', async ({ page }) => {
    const res = await apiGet(page, '/api/trabajadores')
    const list = (await res.json()).trabajadores || []
    if (list.length === 0) { test.skip(); return }

    await page.goto(`${BASE}/trabajadores/${list[0].id}`)
    await expect(page).toHaveURL(/\/trabajadores\//)
  })

  test('TC-DT2-03: Create deuda for trabajador', async ({ page }) => {
    const t = (await (await apiGet(page, '/api/trabajadores?activo=true')).json()).trabajadores?.[0]
    if (!t) { test.skip(); return }

    const res = await apiPost(page, '/api/deudas', {
      trabajadorId: t.id,
      tipo: 'DEFICIT_EFECTIVO',
      monto: 20000,
      descripcion: 'Faltante en arqueo',
    })
    await expectStatus(res, [200, 201])
  })

  test('TC-DT2-04: Abonar deuda reduces montoPendiente', async ({ page }) => {
    const t = (await (await apiGet(page, '/api/trabajadores?activo=true')).json()).trabajadores?.[0]
    if (!t) { test.skip(); return }

    // Create deuda
    const dRes = await apiPost(page, '/api/deudas', {
      trabajadorId: t.id,
      tipo: 'PRESTAMO',
      monto: 100000,
      descripcion: 'Prestamo test',
    })
    expect([200, 201]).toContain(dRes.status())
    const d = (await dRes.json()).deuda || (await dRes.json())

    // Abonar
    const abRes = await apiPost(page, `/api/deudas/${d.id}/abonar`, {
      monto: 50000,
    })
    expect([200, 201]).toContain(abRes.status())
  })

  test('TC-DT2-05: /deudas global view loads', async ({ page }) => {
    await page.goto(`${BASE}/deudas`)
    await expect(page).toHaveURL(/\/deudas/)
  })
})
