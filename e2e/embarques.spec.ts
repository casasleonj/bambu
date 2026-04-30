import { test, expect, type Page } from '@playwright/test'

test.describe('Embarques', () => {
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

  test('page loads and shows embarques', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/embarques')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    await expect(page.locator('h1:has-text("Embarques del Día")')).toBeVisible()
    await expect(page.locator('button:has-text("Nuevo Embarque")')).toBeVisible()
  })

  test('can create a new embarque', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/embarques')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    // Click nuevo embarque
    await page.click('button:has-text("Nuevo Embarque")')
    await page.waitForTimeout(500)
    
    // Select a worker (first option)
    await page.locator('select').first().selectOption({ index: 1 })
    
    // Create (target modal button, not the "+ Crear Embarque" trigger)
    await page.locator('[role="dialog"] button:has-text("Crear")').click()
    await page.waitForTimeout(1000)
    
    // Verify modal closed
    await expect(page.locator('h2:has-text("Nuevo Embarque")')).toHaveCount(0)
    
    // Verify at least one embarque card exists
    await expect(page.locator('text=/#[0-9]+/').first()).toBeVisible()
  })

  test('can open embarque detail and close it', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/embarques')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    // Click on first embarque card if exists
    const cards = page.locator('.bg-white.p-4.rounded-xl.shadow')
    if (await cards.count() > 0) {
      await cards.first().click()
      await page.waitForTimeout(500)
      
      // Should show detail modal with close button (exact match to avoid sidebar logout button)
      await expect(page.getByRole('button', { name: 'Cerrar', exact: true })).toBeVisible()
      
      // Close modal
      await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
      await page.waitForTimeout(300)
    }
  })
})
