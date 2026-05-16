import { test, expect } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000'

async function login(page: any) {
  await page.goto(`${BASE_URL}/login`)
  await page.fill('input[type="text"]', 'admin')
  await page.fill('input[type="password"]', 'admin123')
  await page.click('button:has-text("Ingresar")')
  await page.waitForURL(/.*dashboard/, { timeout: 15000 })
}

test.describe('Configuración', () => {

  test('page loads with tabs', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE_URL}/configuracion`)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('h1:has-text("Configuración")')).toBeVisible()
    await expect(page.locator('button:has-text("Datos de la Empresa")')).toBeVisible()
    await expect(page.locator('button:has-text("Parámetros de Operación")')).toBeVisible()
  })

  test('auto-save persiste cambios', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE_URL}/configuracion`)
    await page.waitForLoadState('networkidle')

    const uniqueName = `Test Empresa ${Date.now()}`
    await page.fill('#empresa_nombre', uniqueName)

    // Wait for auto-save debounce (800ms) + network roundtrip
    await page.waitForTimeout(2500)

    // Should show "Todo guardado" in global indicator
    await expect(page.locator('text=Todo guardado')).toBeVisible({ timeout: 5000 })

    // Refresh and verify
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('#empresa_nombre')).toHaveValue(uniqueName)
  })

  test('tabs cambian sin perder estado', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE_URL}/configuracion`)
    await page.waitForLoadState('networkidle')

    const uniqueName = `Tab Test ${Date.now()}`
    await page.fill('#empresa_nombre', uniqueName)

    // Switch to Operación tab
    await page.click('button:has-text("Parámetros de Operación")')
    await page.waitForTimeout(300)

    // Switch back to Empresa tab
    await page.click('button:has-text("Datos de la Empresa")')
    await page.waitForTimeout(300)

    // Value should persist
    await expect(page.locator('#empresa_nombre')).toHaveValue(uniqueName)
  })

  test('validación evita guardar email inválido', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE_URL}/configuracion`)
    await page.waitForLoadState('networkidle')

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
    await page.waitForLoadState('networkidle')

    const textarea = page.locator('textarea#empresa_direccion')
    await expect(textarea).toBeVisible()
    await expect(textarea).toHaveAttribute('rows', '3')
  })

  test('beforeunload protege cambios sin guardar', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE_URL}/configuracion`)
    await page.waitForLoadState('networkidle')

    await page.fill('#empresa_nombre', 'Cambio sin guardar')

    // Try to navigate away
    page.on('dialog', async dialog => {
      expect(dialog.type()).toBe('beforeunload')
      await dialog.dismiss()
    })

    await page.evaluate(() => window.location.reload())
  })
})
