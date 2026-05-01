import { test, expect, type Page } from '@playwright/test'

test.describe('Pedidos', () => {
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

  test('can create a pedido via venta rapida', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/pedidos')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    // Click venta rapida
    await page.click('button:has-text("Venta Rapida")')
    await page.waitForTimeout(500)
    
    // Add products - increment buttons are green circles with + icon
    await page.locator('button.rounded-full.bg-green-100').first().click()
    await page.locator('button.rounded-full.bg-green-100').first().click()
    
    // Submit (no client needed for punto + full payment)
    await page.click('button:has-text("Cobrar")')
    await page.waitForTimeout(2000)
    
    // Verify modal closed
    await expect(page.locator('h2:has-text("Venta Rapida")')).toHaveCount(0)
    
    // Verify the new pedido appears in the table (Punto + PAGADO badge for fully-paid venta)
    await expect(page.locator('table tbody tr').first()).toContainText('PAGADO')
  })

  test('can create a pedido with envio via venta rapida', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/pedidos')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    await page.click('button:has-text("Venta Rapida")')
    await page.waitForTimeout(500)
    
    // Enable envio first (this resets quantities)
    await page.check('input[type="checkbox"]')
    await page.waitForTimeout(300)
    
    // Add product
    await page.locator('button.rounded-full.bg-green-100').first().click()
    
    // Search for non-existent client to trigger "Crear nuevo"
    await page.fill('input[placeholder="Buscar por nombre o celular..."]', 'Cliente Unico XYZ')
    await page.waitForTimeout(500)
    
    // Click "Crear nuevo cliente"
    await page.click('button:has-text("Crear nuevo cliente")')
    await page.waitForTimeout(300)
    
    // Fill new client form
    await page.fill('input[placeholder="Nombre *"]', 'Cliente Test')
    await page.fill('input[placeholder="Celular *"]', '3009998888')
    await page.fill('input[placeholder="Dirección *"]', 'Calle Test 123')
    
    // Submit
    await page.click('button:has-text("Cobrar")')
    await page.waitForTimeout(2000)
    
    // Verify modal closed
    await expect(page.locator('h2:has-text("Venta Rapida")')).toHaveCount(0)
    
    // Verify the new pedido appears in the table (Envio)
    await expect(page.locator('table tbody').first()).toContainText('Envío')
  })
})
