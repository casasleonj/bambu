import { test, expect, type Page } from '@playwright/test'

test.describe('Produccion', () => {
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

  test('page loads with stepper', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/produccion')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    await expect(page.locator('h1:has-text("Registro de Producción")')).toBeVisible()
    // Stepper labels - use exact match to avoid matching headings
    await expect(page.getByText('Stock Inicial', { exact: true })).toBeVisible()
    await expect(page.getByText('Conteos', { exact: true })).toBeVisible()
    await expect(page.getByText('Confirmar', { exact: true })).toBeVisible()
  })

  test('can navigate through production steps', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/produccion')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    // Step 1: Stock inicial
    await expect(page.locator('h2:has-text("Stock Inicial del Día")')).toBeVisible()
    await page.click('button:has-text("Siguiente →")')
    
    // Step 2: Conteos
    await page.waitForTimeout(500)
    await expect(page.locator('h2:has-text("Registro de Conteos")')).toBeVisible()
    
    // Fill conteos
    await page.locator('input[placeholder="0"]').first().fill('100')
    await page.locator('input[placeholder="0"]').nth(1).fill('102')
    await page.locator('input[placeholder="0"]').nth(2).fill('50')
    await page.locator('input[placeholder="0"]').nth(3).fill('52')
    
    await page.click('button:has-text("Siguiente →")')
    
    // Step 3: Confirmar
    await page.waitForTimeout(500)
    await expect(page.locator('h2:has-text("Confirmar Producción")')).toBeVisible()
    
    // Select worker
    await page.locator('select').first().selectOption({ index: 1 })
    
    // Should show calculated production
    await expect(page.locator('text=Producción Calculada')).toBeVisible()
  })

  test('calculates promedio correctly', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/produccion')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    await page.click('button:has-text("Siguiente →")')
    await page.waitForTimeout(500)
    
    // Agua: 100 + 102 = 202 / 2 = 101
    await page.locator('input[placeholder="0"]').first().fill('100')
    await page.locator('input[placeholder="0"]').nth(1).fill('102')
    
    await expect(page.locator('text=Promedio: 101')).toBeVisible()
    
    // Hielo: 50 + 52 = 102 / 2 = 51
    await page.locator('input[placeholder="0"]').nth(2).fill('50')
    await page.locator('input[placeholder="0"]').nth(3).fill('52')
    
    await expect(page.locator('text=Promedio: 51')).toBeVisible()
  })
})
