import { test, expect, type Page } from '@playwright/test'

test.describe('Cierre', () => {
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

  test('page loads and shows resumen del dia', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/cierre')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    await expect(page.locator('h1:has-text("Cierre del Día")')).toBeVisible()
    await expect(page.locator('h2:has-text("Resumen del Día")')).toBeVisible()
    // Use first() to avoid strict mode violation from sidebar + content matches
    await expect(page.getByText('Pedidos').first()).toBeVisible()
    await expect(page.getByText('Ventas').first()).toBeVisible()
  })

  test('asistente is redirected from cierre page', async ({ page }) => {
    await login(page, 'asistente', 'asist123')
    await handleBaseCajaModal(page)
    
    await page.goto('/cierre')
    await page.waitForLoadState('networkidle')
    
    await expect(page).toHaveURL(/.*dashboard/)
  })

  test('admin can input stock and see neto caja', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/cierre')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    // Fill stock inputs
    await page.locator('input[placeholder="Stock Inicial"]').first().fill('100')
    await page.locator('input[placeholder="Producción"]').first().fill('50')
    await page.locator('input[placeholder="Stock Final"]').first().fill('120')
    
    await expect(page.locator('text=Neto Caja')).toBeVisible()
  })
})
