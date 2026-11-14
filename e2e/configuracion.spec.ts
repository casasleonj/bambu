// @tests api/config
import { test, expect } from '@playwright/test'
import { resetDatabase, loginAs, appMain } from './fixtures'

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000'

async function login(page: Parameters<typeof loginAs>[0]) {
  await loginAs(page, 'admin')
}

test.describe('Configuración', () => {
  test.describe.configure({ mode: 'serial' })

  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeAll(() => {
    resetDatabase()
  })


  test('page loads with tabs', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE_URL}/configuracion`)
    await expect(appMain(page).locator('#empresa_nombre')).toBeVisible()

    await expect(page.locator('h1:has-text("Configuración")')).toBeVisible()
    await expect(page.locator('button:has-text("Datos de la Empresa")')).toBeVisible()
    await expect(page.locator('button:has-text("Parámetros de Operación")')).toBeVisible()
  })

  test('auto-save persiste cambios', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE_URL}/configuracion`)
    await expect(appMain(page).locator('#empresa_nombre')).toBeVisible()

    const uniqueName = `Test Empresa ${Date.now()}`
    await appMain(page).locator('#empresa_nombre').fill(uniqueName)

    // Wait for auto-save debounce (800ms) + network roundtrip
    await page.waitForTimeout(2500)

    // Should show "Todo guardado" in global indicator
    await expect(page.locator('text=Todo guardado')).toBeVisible({ timeout: 5000 })

    // Refresh and verify
    await page.reload()
    await expect(appMain(page).locator('#empresa_nombre')).toBeVisible()
    await expect(appMain(page).locator('#empresa_nombre')).toHaveValue(uniqueName)
  })

  test('tabs cambian sin perder estado', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE_URL}/configuracion`)
    await expect(appMain(page).locator('#empresa_nombre')).toBeVisible()

    const uniqueName = `Tab Test ${Date.now()}`
    await appMain(page).locator('#empresa_nombre').fill(uniqueName)

    // Switch to Operación tab
    await page.click('button:has-text("Parámetros de Operación")')
    await page.waitForTimeout(300)

    // Switch back to Empresa tab
    await page.click('button:has-text("Datos de la Empresa")')
    await page.waitForTimeout(300)

    // Value should persist
    await expect(appMain(page).locator('#empresa_nombre')).toHaveValue(uniqueName)
  })

  test('validación evita guardar email inválido', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE_URL}/configuracion`)
    await expect(appMain(page).locator('#empresa_nombre')).toBeVisible()

    await page.fill('#empresa_email', 'no-es-email')
    // Trigger blur to ensure validation runs after debounce
    await page.locator('#empresa_email').blur()

    // Wait for debounce + validation (800ms debounce + margin)
    await page.waitForTimeout(2000)

    await expect(page.locator('text=Email inválido')).toBeVisible({ timeout: 5000 })
  })

  test('dirección usa textarea', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE_URL}/configuracion`)
    await expect(appMain(page).locator('#empresa_nombre')).toBeVisible()

    const textarea = appMain(page).locator('textarea#empresa_direccion')
    await expect(textarea).toBeVisible()
    await expect(textarea).toHaveAttribute('rows', '3')
  })

  test('beforeunload protege cambios sin guardar', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE_URL}/configuracion`)
    await expect(appMain(page).locator('#empresa_nombre')).toBeVisible()

    await appMain(page).locator('#empresa_nombre').fill('Cambio sin guardar')

    // Try to navigate away
    page.on('dialog', async dialog => {
      expect(dialog.type()).toBe('beforeunload')
      await dialog.dismiss()
    })

    await page.evaluate(() => window.location.reload())
  })
})
