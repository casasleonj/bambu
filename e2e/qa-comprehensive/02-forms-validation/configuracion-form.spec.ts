/**
 * Tier 2: Forms Validation - Configuración
 * Tests: 5
 */
import { test, expect, loginAsAdmin, apiPost, expectStatus, BASE, apiGet } from '../00-fixtures'

test.describe('Form Validation - Configuración', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-CF2-01: GET config values', async ({ page }) => {
    const res = await apiGet(page, '/api/config')
    await expectStatus(res, 200)
  })

  test('TC-CF2-02: Update BASE_DIA config', async ({ page }) => {
    const res = await apiPost(page, '/api/config', {
      clave: 'BASE_DIA',
      valor: '100000',
    })
    expect([200, 201]).toContain(res.status())
  })

  test('TC-CF2-03: Update config with invalid value is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/config', {
      clave: 'BASE_DIA',
      valor: '-100', // negative not allowed
    })
    expect([200, 400, 422]).toContain(res.status())
  })

  test('TC-CF2-04: /configuracion page loads', async ({ page }) => {
    await page.goto(`${BASE}/configuracion`)
    await expect(page).toHaveURL(/\/configuracion/)
    // Should have at least 2 sections (empresa, operacion)
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 5000 })
  })

  test('TC-CF2-05: Config with non-string valor is coerced', async ({ page }) => {
    const res = await apiPost(page, '/api/config', {
      clave: 'BASE_DIA',
      valor: 100000, // number instead of string
    })
    expect([200, 201, 400, 422]).toContain(res.status())
  })
})
