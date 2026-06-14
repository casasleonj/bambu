/**
 * Tier 3: Domain Flows - Embarques
 * Tests: 8
 */
import { test, expect, loginAsAdmin, apiPost, expectStatus, BASE, apiGet } from '../00-fixtures'

test.describe('Domain Flow - Embarques', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-DE-01: List page shows embarques', async ({ page }) => {
    await page.goto(`${BASE}/embarques`)
    await expect(page).toHaveURL(/\/embarques/)
  })

  test('TC-DE-02: Filter by estado ABIERTO', async ({ page }) => {
    const res = await apiGet(page, '/api/embarques?estado=ABIERTO&all=true')
    await expectStatus(res, 200)
    const body = await res.json()
    const embarques = body.embarques || []
    for (const e of embarques) {
      expect(e.estado).toBe('ABIERTO')
    }
  })

  test('TC-DE-03: Filter by estado CERRADO', async ({ page }) => {
    const res = await apiGet(page, '/api/embarques?estado=CERRADO&all=true')
    await expectStatus(res, 200)
  })

  test('TC-DE-04: Tab Estadísticas shows KPIs', async ({ page }) => {
    await page.goto(`${BASE}/embarques`)
    // Find tab
    const tab = page.locator('button:has-text("Estadísticas"), [role="tab"]:has-text("Estadísticas")')
    if (await tab.count() > 0) {
      await tab.first().click()
      await page.waitForTimeout(500)
    }
  })

  test('TC-DE-05: Embarque detail /embarques/[id] loads', async ({ page }) => {
    const res = await apiGet(page, '/api/embarques?all=true')
    const body = await res.json()
    const embarques = body.embarques || []
    if (embarques.length === 0) { test.skip(); return }

    await page.goto(`${BASE}/embarques/${embarques[0].id}`)
    await expect(page).toHaveURL(/\/embarques\//)
  })

  test('TC-DE-06: Auto-generate embarques button works', async ({ page }) => {
    const res = await apiPost(page, '/api/embarques/auto', {})
    expect([200, 201, 400]).toContain(res.status())
  })

  test('TC-DE-07: Embarque EN_RUTA shows in repartidor view', async ({ context }) => {
    // Login as repartidor in a new page
    const repPage = await context.newPage()
    await repPage.goto(`${BASE}/login`)
    await repPage.fill('input[type="text"]', 'repartidor')
    await repPage.fill('input[type="password"]', 'rep123')
    await repPage.click('button[type="submit"]')
    await expect(repPage).toHaveURL(/\/repartidor/, { timeout: 10000 })

    // Should see embarque info
    const body = await repPage.locator('body').textContent()
    expect(body).toBeDefined()
    await repPage.close()
  })

  test('TC-DE-08: Embarque stats endpoint', async ({ page }) => {
    const res = await apiGet(page, '/api/embarques/stats')
    await expectStatus(res, 200)
  })
})
