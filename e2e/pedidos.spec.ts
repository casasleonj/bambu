import { test, expect } from '@playwright/test'

test.describe('Pedidos', () => {
  async function login(page, username, password) {
    await page.goto('/login')
    await page.fill('input[placeholder="Ingrese usuario"]', username)
    await page.fill('input[placeholder="Ingrese contraseña"]', password)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard')
  }

  async function handleBaseCajaModal(page) {
    const baseCajaBtn = page.locator('button:has-text("Continuar →")')
    if (await baseCajaBtn.count() > 0) {
      await page.fill('input[type="number"]', '50000')
      await baseCajaBtn.click()
      await page.waitForTimeout(500)
    }
  }

  test('can create a pedido via venta rapida', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/pedidos')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    // Count existing rows
    const existingRows = await page.locator('table tbody tr').count()
    
    // Click venta rapida
    await page.click('button:has-text("Venta Rapida")')
    await page.waitForTimeout(500)
    
    // Add products
    const plusButtons = page.locator('div.fixed button.rounded-full.bg-blue-100')
    await plusButtons.first().click()
    await plusButtons.first().click()
    
    // Submit
    await page.click('button:has-text("Cobrar")')
    await page.waitForTimeout(2000)
    
    // Verify modal closed
    await expect(page.locator('h2:has-text("Venta Rapida")')).toHaveCount(0)
    
    // Verify a new row was added
    await expect(page.locator('table tbody tr')).toHaveCount(existingRows + 1)
  })

  test('can create a pedido with envio via venta rapida', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/pedidos')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    const existingRows = await page.locator('table tbody tr').count()
    
    await page.click('button:has-text("Venta Rapida")')
    await page.waitForTimeout(500)
    
    // Add product
    const plusButtons = page.locator('div.fixed button.rounded-full.bg-blue-100')
    await plusButtons.first().click()
    
    // Enable envio
    await page.check('input[type="checkbox"]')
    await page.fill('input[placeholder="Nombre *"]', 'Cliente Test')
    await page.fill('input[placeholder="Celular *"]', '3009998888')
    await page.fill('input[placeholder*="Dirección"]', 'Calle Test 123')
    
    // Submit
    await page.click('button:has-text("Cobrar")')
    await page.waitForTimeout(2000)
    
    // Verify a new row was added
    await expect(page.locator('table tbody tr')).toHaveCount(existingRows + 1)
  })
})
