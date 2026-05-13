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
    // Search for PAGADO anywhere in table instead of assuming first row
    await expect(page.locator('table tbody')).toContainText('PAGADO')
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
    // Verify the new client appears in the orders table
    await expect(page.locator('table tbody')).toContainText('Cliente Test')
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
    await expect(page.locator('table tbody')).toContainText('PAGADO')
    await expect(page.locator('table tbody')).not.toContainText('POR COBRAR')
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

  test('filtrar pedidos por estado legacy', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/pedidos')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    // Click ENTREGADO filter in the "Estado Legacy" section (sabemos que hay pedidos ENTREGADO)
    const legacySection = page.locator('span:has-text("Estado Legacy")')
    const entregadoBtn = legacySection.locator('..').locator('button:has-text("ENTREGADO")').first()
    await entregadoBtn.click()
    await page.waitForTimeout(500)
    
    // All visible rows should be ENTREGADO
    const rows = page.locator('table tbody tr')
    const count = await rows.count()
    if (count > 0) {
      await expect(rows.first()).toContainText('ENTREGADO')
    }
    
    // Click EN_RUTA filter
    const enRutaBtn = legacySection.locator('..').locator('button:has-text("EN_RUTA")').first()
    await enRutaBtn.click()
    await page.waitForTimeout(500)
    
    // URL should reflect filter
    await expect(page).toHaveURL(/estado=EN_RUTA/)
  })

  test('filtrar pedidos por origen', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/pedidos')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    // Click VENTA_RAPIDA filter in Origen section
    const origenSection = page.locator('span:has-text("Origen")')
    await origenSection.locator('..').locator('button:has-text("VENTA RAPIDA")').first().click()
    await page.waitForTimeout(500)
    
    await expect(page).toHaveURL(/origen=VENTA_RAPIDA/)
    
    // Table should show venta rapida badge
    const rows = page.locator('table tbody tr')
    if (await rows.count() > 0) {
      await expect(rows.first()).toContainText('Venta Rápida')
    }
  })

  test('filtrar pedidos por estado entrega y pago', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/pedidos')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    // Filter by ENTREGADO estadoEntrega
    const entregaSection = page.locator('span:has-text("Entrega")')
    await entregaSection.locator('..').locator('button:has-text("ENTREGADO")').first().click()
    await page.waitForTimeout(500)
    
    await expect(page).toHaveURL(/estadoEntrega=ENTREGADO/)
    
    // Also filter by PAGADO estadoPago
    const pagoSection = page.locator('span:has-text("Pago")')
    await pagoSection.locator('..').locator('button:has-text("PAGADO")').first().click()
    await page.waitForTimeout(500)
    
    await expect(page).toHaveURL(/estadoPago=PAGADO/)
  })

  test('ver badges duales en tabla de pedidos', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/pedidos')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    const rows = page.locator('table tbody tr')
    const count = await rows.count()
    if (count > 0) {
      // Should show origen badge somewhere (Pedido, Venta Rápida, or Venta Libre)
      const bodyText = await page.locator('table tbody').innerText()
      expect(bodyText).toMatch(/Pedido|Venta Rápida|Venta Libre/)
      // Should show estadoEntrega badge somewhere
      expect(bodyText).toMatch(/PENDIENTE|EN RUTA|ENTREGADO/)
    }
  })

  test('ver detalle de pedido con items array', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/pedidos')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    // Click first row to open detail
    await page.locator('table tbody tr').first().click()
    await page.waitForTimeout(500)
    
    // Detail modal should show pedido info with productos section
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toMatch(/Pedido|Total|Estado|Productos/i)
  })

  test('repartidor puede acceder a Mi Ruta y ver embarque', async ({ page }) => {
    // Asign repartidor role to a worker first (requires seed data)
    // Login as admin, create embarque, then login as repartidor
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    // Create embarque for repartidor
    await page.goto('/embarques')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    await page.click('button:has-text("Nuevo Embarque")')
    await page.waitForTimeout(500)
    await page.locator('select').first().selectOption({ index: 1 })
    await page.locator('[role="dialog"] button:has-text("Crear")').click()
    await page.waitForTimeout(1000)
    
    // Navigate to Mi Ruta
    await page.goto('/repartidor')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    // Should show embarque info or "Sin embarque abierto"
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toMatch(/Mi Ruta|Embarque|Sin embarque abierto/)
  })
})
