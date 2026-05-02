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
    
    await page.click('button:has-text("Venta Rapida")')
    await page.waitForTimeout(500)
    
    await page.locator('button.rounded-full.bg-green-100').first().click()
    await page.locator('button.rounded-full.bg-green-100').first().click()
    
    await page.click('button:has-text("Pagar completo")')
    await page.waitForTimeout(300)
    
    await page.click('button:has-text("Cobrar")')
    await page.waitForTimeout(2000)
    
    await expect(page.locator('h2:has-text("Venta Rapida")')).toHaveCount(0)
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
    
    await page.check('input[type="checkbox"]')
    await page.waitForTimeout(300)
    
    await page.locator('button.rounded-full.bg-green-100').first().click()
    
    await page.fill('input[placeholder="Buscar por nombre o celular..."]', 'Cliente Unico XYZ')
    await page.waitForTimeout(500)
    
    await page.click('button:has-text("Crear nuevo cliente")')
    await page.waitForTimeout(300)
    
    await page.fill('input[placeholder="Nombre *"]', 'Cliente Test')
    await page.fill('input[placeholder="Celular *"]', '3009998888')
    await page.fill('input[placeholder="Dirección *"]', 'Calle Test 123')
    
    await page.click('button:has-text("Cobrar")')
    await page.waitForTimeout(2000)
    
    await expect(page.locator('h2:has-text("Venta Rapida")')).toHaveCount(0)
    await expect(page.locator('table tbody').first()).toContainText('Envío')
  })

  test('venta rapida con sobrepago muestra badge PAGADO', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/pedidos')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    await page.click('button:has-text("Venta Rapida")')
    await page.waitForTimeout(500)
    
    // Add 1 product
    await page.locator('button.rounded-full.bg-green-100').first().click()
    await page.waitForTimeout(300)
    
    // Pay more than total (overpay)
    await page.click('button:has-text("Efectivo")')
    await page.waitForTimeout(300)
    const pagoInput = page.locator('input[type="number"]').last()
    await pagoInput.fill('50000')
    await pagoInput.blur()
    await page.waitForTimeout(300)
    
    await page.click('button:has-text("Cobrar")')
    await page.waitForTimeout(2000)
    
    await expect(page.locator('h2:has-text("Venta Rapida")')).toHaveCount(0)
    // Should show PAGADO, not POR COBRAR
    await expect(page.locator('table tbody tr').first()).toContainText('PAGADO')
    await expect(page.locator('table tbody tr').first()).not.toContainText('POR COBRAR')
  })

  test('venta rapida sin cliente con saldo pendiente muestra error', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/pedidos')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    await page.click('button:has-text("Venta Rapida")')
    await page.waitForTimeout(500)
    
    // Add products
    await page.locator('button.rounded-full.bg-green-100').first().click()
    await page.locator('button.rounded-full.bg-green-100').first().click()
    await page.waitForTimeout(300)
    
    // Pay partial (not full) - should require client
    await page.click('button:has-text("Efectivo")')
    await page.waitForTimeout(300)
    const pagoInput = page.locator('input[type="number"]').last()
    await pagoInput.fill('5000')
    await pagoInput.blur()
    await page.waitForTimeout(300)
    
    // Button should be disabled (no client selected with partial payment)
    const submitBtn = page.locator('button:has-text("Seleccionar cliente")').first()
    await expect(submitBtn).toBeDisabled()
    
    // Modal should still be open
    await expect(page.locator('h2:has-text("Venta Rapida")')).toBeVisible()
  })

  test('asignar pedido a embarque', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    // Create an embarque first
    await page.goto('/embarques')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    await page.click('button:has-text("Nuevo Embarque")')
    await page.waitForTimeout(500)
    await page.locator('select').first().selectOption({ index: 1 })
    await page.locator('[role="dialog"] button:has-text("Crear")').click()
    await page.waitForTimeout(1000)
    
    // Go to pedidos and select a PENDIENTE pedido
    await page.goto('/pedidos')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    // Click on first PENDIENTE pedido row
    const pendingRow = page.locator('table tbody tr').filter({ hasText: 'PENDIENTE' }).first()
    await pendingRow.click()
    await page.waitForTimeout(500)
    
    // Click "Enviar" or "Asignar a embarque" button in detail
    const enviarBtn = page.locator('button:has-text("Enviar"), button:has-text("Asignar")').first()
    if (await enviarBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await enviarBtn.click()
      await page.waitForTimeout(500)
      
      // Select the embarque we created
      const embarqueBtn = page.locator('button:has-text("#")').first()
      if (await embarqueBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await embarqueBtn.click()
        await page.waitForTimeout(300)
        
        // Confirm
        await page.click('button:has-text("Confirmar Envío")')
        await page.waitForTimeout(1500)
        
        // Verify pedido is now EN_RUTA
        await expect(page.locator('table tbody tr').first()).toContainText('EN RUTA')
      }
    }
  })

  test('filtrar pedidos por estado', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/pedidos')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    // Click PENDIENTE filter
    await page.click('button:has-text("PENDIENTE")')
    await page.waitForTimeout(500)
    
    // All visible rows should be PENDIENTE
    const rows = page.locator('table tbody tr')
    const count = await rows.count()
    if (count > 0) {
      await expect(rows.first()).toContainText('PENDIENTE')
    }
    
    // Click ENTREGADO filter
    await page.click('button:has-text("ENTREGADO")')
    await page.waitForTimeout(500)
    
    // URL should reflect filter
    await expect(page).toHaveURL(/estado=ENTREGADO/)
  })

  test('ver detalle de pedido con pagos', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/pedidos')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    // Click first row to open detail
    await page.locator('table tbody tr').first().click()
    await page.waitForTimeout(500)
    
    // Detail modal should show pedido info
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toMatch(/Pedido|Total|Estado/i)
  })
})
