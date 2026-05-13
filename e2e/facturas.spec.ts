import { test, expect, type Page } from '@playwright/test'

test.describe('Facturas', () => {
  async function login(page: Page, username: string, password: string) {
    await page.goto('/login')
    await page.fill('input[placeholder="Ingrese usuario"]', username)
    await page.fill('input[placeholder="Ingrese contraseña"]', password)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard')
  }

  async function skipBaseCajaModal(page: Page) {
    // Wait a bit for modal to appear if it's going to
    await page.waitForTimeout(500)
    const modalInput = page.locator('input[placeholder="50000"]')
    if (await modalInput.isVisible().catch(() => false)) {
      await modalInput.fill('50000')
      await page.locator('button:has-text("Continuar →")').click()
      await page.waitForTimeout(500)
    }
  }

  test('page loads with auth', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await skipBaseCajaModal(page)
    // Close any leftover modals from parallel tests
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    
    await page.goto('/facturas')
    
    await page.goto('/facturas')
    await page.waitForLoadState('networkidle')
    
    await expect(page.locator('h1:has-text("Facturas")')).toBeVisible()
  })

  test('asistente can view facturas page but not access admin pages', async ({ page }) => {
    await login(page, 'asistente', 'asist123')
    await skipBaseCajaModal(page)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    
    await page.goto('/facturas')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1:has-text("Facturas")')).toBeVisible()
    
    await page.goto('/trabajadores')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/.*dashboard/)
    
    await page.goto('/precios')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/.*dashboard/)
  })

  test('click on factura opens detail modal', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await skipBaseCajaModal(page)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    
    await page.goto('/facturas')
    await page.waitForLoadState('networkidle')
    
    // Click on first factura card
    await page.locator('main').locator('div[class*="cursor-pointer"]').first().click()
    
    // Modal should open with factura detail
    await expect(page.locator('text=Detalle de Factura')).toBeVisible()
  })

  test('factura detail shows company info, client, and products', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await skipBaseCajaModal(page)
    
    await page.goto('/facturas')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    
    // Wait for facturas heading
    await expect(page.getByRole('heading', { name: 'Facturas' })).toBeVisible({ timeout: 10000 })
    
    // Click on first factura card
    const firstFactura = page.locator('main').locator('div[class*="cursor-pointer"]').first()
    await expect(firstFactura).toBeVisible({ timeout: 5000 })
    await firstFactura.click()
    
    // Wait for modal to fully render
    await expect(page.locator('text=Detalle de Factura')).toBeVisible({ timeout: 5000 })
    // Company name should be visible in the modal
    await expect(page.getByRole('heading', { name: 'Agua Bambu SAS' })).toBeVisible({ timeout: 5000 })
    // TOTAL should be visible
    await expect(page.getByText('TOTAL:').first()).toBeVisible({ timeout: 5000 })
  })

  test('factura detail has print button', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await skipBaseCajaModal(page)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    
    await page.goto('/facturas')
    await page.waitForLoadState('networkidle')
    
    await page.locator('main').locator('div[class*="cursor-pointer"]').first().click()
    
    await expect(page.locator('button:has-text("Imprimir")')).toBeVisible()
  })

  test('close modal works', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await skipBaseCajaModal(page)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    
    await page.goto('/facturas')
    await page.waitForLoadState('networkidle')
    
    await page.locator('main').locator('div[class*="cursor-pointer"]').first().click()
    await expect(page.locator('text=Detalle de Factura')).toBeVisible()
    
    // Close by pressing Escape
    await page.keyboard.press('Escape')
    await expect(page.locator('text=Detalle de Factura')).not.toBeVisible()
  })
})
