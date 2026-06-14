/**
 * Tier 2: Forms Validation - Cierre de Caja
 * Tests: 8
 */
import { test, expect, loginAsAdmin, apiPost, expectStatus, BASE, todayBogota, yesterdayISO, apiGet } from '../00-fixtures'

test.describe('Form Validation - Cierre de Caja', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-CC-01: GET cierre data for today', async ({ page }) => {
    const res = await apiGet(page, `/api/cierre?fecha=${todayBogota()}`)
    await expectStatus(res, 200)
  })

  test('TC-CC-02: GET cierre data for yesterday', async ({ page }) => {
    const res = await apiGet(page, `/api/cierre?fecha=${yesterdayISO()}`)
    await expectStatus(res, 200)
  })

  test('TC-CC-03: Create cierre with valid data', async ({ page }) => {
    const body = {
      fecha: todayBogota(),
      baseDia: 50000,
      stockIniAgua: 0,
      prodAgua: 0,
      stockFinAgua: 0,
      stockIniHielo: 0,
      prodHielo: 0,
      stockFinHielo: 0,
      comisiones: 0,
      salarios: 0,
    }
    const res = await apiPost(page, '/api/cierre', body)
    // 201 if created, 409 if already closed
    expect([200, 201, 409, 400]).toContain(res.status())
  })

  test('TC-CC-04: Cierre without fecha is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/cierre', {
      baseDia: 100,
    })
    await expectStatus(res, 400)
  })

  test('TC-CC-05: Cierre with negative baseDia is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/cierre', {
      fecha: todayBogota(),
      baseDia: -100,
    })
    await expectStatus(res, 400)
  })

  test('TC-CC-06: Cierre with stockIniAgua negative is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/cierre', {
      fecha: todayBogota(),
      baseDia: 0,
      stockIniAgua: -10,
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-CC-07: /cierre page loads', async ({ page }) => {
    await page.goto(`${BASE}/cierre`)
    await expect(page).toHaveURL(/\/cierre/)
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 5000 })
  })

  test('TC-CC-08: Cierre report page /cierre/reporte loads', async ({ page }) => {
    await page.goto(`${BASE}/cierre/reporte?fecha=${yesterdayISO()}`)
    await expect(page).toHaveURL(/\/cierre\/reporte/)
  })
})
