import { test, expect, type Page } from '@playwright/test'

test.describe('Facturas', () => {
  async function login(page: Page, username: string, password: string) {
    await page.goto('/login')
    await page.fill('input[placeholder="Ingrese usuario"]', username)
    await page.fill('input[placeholder="Ingrese contraseña"]', password)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard')
  }

  async function handleBaseCajaModal(page: Page) {
    const baseCajaBtn = page.locator('button:has-text("Continuar →")')
    if (await baseCajaBtn.count() > 0) {
      await page.fill('input[type="number"]', '50000')
      await baseCajaBtn.click()
      await page.waitForTimeout(500)
    }
  }

  test('page loads with auth', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/facturas')
    await page.waitForLoadState('networkidle')
    
    await expect(page.locator('h1:has-text("Facturas")')).toBeVisible()
  })

  test('asistente can view facturas page but not access admin pages', async ({ page }) => {
    await login(page, 'asistente', 'asist123')
    await handleBaseCajaModal(page)
    
    // Asistente CAN view facturas (read-only access)
    await page.goto('/facturas')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1:has-text("Facturas")')).toBeVisible()
    
    // But asistente CANNOT access admin-only pages
    await page.goto('/trabajadores')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/.*dashboard/)
    
    await page.goto('/precios')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/.*dashboard/)
  })
})
