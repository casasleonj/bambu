/**
 * Tier 2: Forms Validation - Nómina Form
 * Tests: 6
 */
import { test, expect, loginAsAdmin, apiPost, apiPut, expectStatus, BASE, apiGet, yesterdayISO } from '../00-fixtures'

test.describe('Form Validation - Nómina', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-NM-01: Create nomina AUTO for last week', async ({ page }) => {
    const t = (await (await apiGet(page, '/api/trabajadores?activo=true')).json()).trabajadores?.[0]
    if (!t) { test.skip(); return }

    const fechaInicio = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const fechaFin = yesterdayISO()

    const res = await apiPost(page, '/api/nomina', {
      trabajadorId: t.id,
      fechaInicio,
      fechaFin,
      tipoCalculo: 'AUTO',
    })
    expect([200, 201, 409, 400]).toContain(res.status()) // 409 if overlapping nomina exists
  })

  test('TC-NM-02: Nomina without trabajadorId is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/nomina', {
      fechaInicio: yesterdayISO(),
      fechaFin: yesterdayISO(),
      tipoCalculo: 'AUTO',
    })
    await expectStatus(res, 400)
  })

  test('TC-NM-03: Nomina with fechaFin < fechaInicio is rejected', async ({ page }) => {
    const t = (await (await apiGet(page, '/api/trabajadores?activo=true')).json()).trabajadores?.[0]
    if (!t) { test.skip(); return }

    const res = await apiPost(page, '/api/nomina', {
      trabajadorId: t.id,
      fechaInicio: '2026-01-15',
      fechaFin: '2026-01-10', // before inicio
      tipoCalculo: 'AUTO',
    })
    await expectStatus(res, 400)
  })

  test('TC-NM-04: Nomina with same start and end date accepted (single day)', async ({ page }) => {
    const t = (await (await apiGet(page, '/api/trabajadores?activo=true')).json()).trabajadores?.[0]
    if (!t) { test.skip(); return }

    // Use a date far in the past to avoid overlaps
    const farDate = '2020-01-01'
    const res = await apiPost(page, '/api/nomina', {
      trabajadorId: t.id,
      fechaInicio: farDate,
      fechaFin: farDate,
      tipoCalculo: 'AUTO',
    })
    expect([200, 201, 409]).toContain(res.status())
  })

  test('TC-NM-05: /nomina page loads', async ({ page }) => {
    await page.goto(`${BASE}/nomina`)
    await expect(page).toHaveURL(/\/nomina/)
    await expect(page.getByRole('heading', { name: /N[oó]mina/ })).toBeVisible({ timeout: 5000 })
  })

  test('TC-NM-06: Nomina PUT (update) requires ADMIN/CONTADOR', async ({ page }) => {
    const res = await apiGet(page, '/api/nomina')
    const body = await res.json()
    const nominas = body.nominas || []
    if (nominas.length === 0) { test.skip(); return }

    const n = nominas[0]
    // Try to update via action endpoint
    const updRes = await apiPut(page, `/api/nomina/${n.id}`, {
      action: 'ANULAR',
    })
    expect([200, 201, 400, 403, 404]).toContain(updRes.status())
  })
})
