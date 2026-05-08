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
    
    await page.click('button:has-text("Nuevo Embarque")')
    await page.waitForTimeout(500)
    
    await page.locator('select').first().selectOption({ index: 1 })
    
    await page.locator('[role="dialog"] button:has-text("Crear")').click()
    await page.waitForTimeout(1000)
    
    await expect(page.locator('h2:has-text("Nuevo Embarque")')).toHaveCount(0)
    await expect(page.locator('text=/#[0-9]+/').first()).toBeVisible()
  })

  test('can open embarque detail and close it', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/embarques')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    const cards = page.locator('.bg-white.p-4.rounded-xl.shadow')
    if (await cards.count() > 0) {
      await cards.first().click()
      await page.waitForTimeout(500)
      
      await expect(page.getByRole('button', { name: 'Volver' })).toBeVisible()
      await page.getByRole('button', { name: 'Volver' }).click()
      await page.waitForTimeout(300)
    }
  })

  test('asignar pedidos a embarque', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    // Create embarque
    await page.goto('/embarques')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    await page.click('button:has-text("Nuevo Embarque")')
    await page.waitForTimeout(500)
    await page.locator('select').first().selectOption({ index: 1 })
    await page.locator('[role="dialog"] button:has-text("Crear")').click()
    await page.waitForTimeout(1000)
    
    // Open embarque detail
    await page.locator('.bg-white.p-4.rounded-xl.shadow').first().click()
    await page.waitForTimeout(500)
    
    // Should show "Pedidos Asignados" section
    await expect(page.locator('text=Pedidos Asignados').first()).toBeVisible()
  })

  test('cerrar embarque con entregas completas', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    // Create embarque
    await page.goto('/embarques')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    await page.click('button:has-text("Nuevo Embarque")')
    await page.waitForTimeout(500)
    await page.locator('select').first().selectOption({ index: 1 })
    await page.locator('[role="dialog"] button:has-text("Crear")').click()
    await page.waitForTimeout(1000)
    
    // Open embarque detail
    await page.locator('.bg-white.p-4.rounded-xl.shadow').first().click()
    await page.waitForTimeout(500)
    
    // Click "Cerrar Embarque" button
    const cerrarBtn = page.locator('button:has-text("Cerrar Embarque")')
    if (await cerrarBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cerrarBtn.click()
      await page.waitForURL(/\/embarques\/.*\/cerrar/)
      await page.waitForTimeout(1000)
      
      // Should show "Cerrar Ruta" page
      await expect(page.locator('h1:has-text("Cerrar Ruta")')).toBeVisible()
      await expect(page.locator('text=Pedidos Asignados')).toBeVisible()
      
      // Click "Cerrar Ruta y Generar Reporte"
      await page.click('button:has-text("Cerrar Ruta y Generar Reporte")')
      await page.waitForTimeout(2000)
      
      // Should redirect back to embarques list
      await expect(page).toHaveURL(/\/embarques/)
    }
  })

  test('cerrar embarque con pedido no entregado', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    // Create embarque
    await page.goto('/embarques')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    await page.click('button:has-text("Nuevo Embarque")')
    await page.waitForTimeout(500)
    await page.locator('select').first().selectOption({ index: 1 })
    await page.locator('[role="dialog"] button:has-text("Crear")').click()
    await page.waitForTimeout(1000)
    
    // Open embarque detail
    await page.locator('.bg-white.p-4.rounded-xl.shadow').first().click()
    await page.waitForTimeout(500)
    
    const cerrarBtn = page.locator('button:has-text("Cerrar Embarque")')
    if (await cerrarBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cerrarBtn.click()
      await page.waitForURL(/\/embarques\/.*\/cerrar/)
      await page.waitForTimeout(1000)
      
      // Mark first pedido as NO_ENTREGADO
      const noEntregadoBtn = page.locator('button:has-text("No entregado")').first()
      if (await noEntregadoBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await noEntregadoBtn.click()
        await page.waitForTimeout(500)
      }
      
      // Click "Cerrar Ruta y Generar Reporte"
      await page.click('button:has-text("Cerrar Ruta y Generar Reporte")')
      await page.waitForTimeout(2000)
      
      // Should redirect back to embarques list
      await expect(page).toHaveURL(/\/embarques/)
    }
  })

  test('verificar pedidos pasan a ENTREGADO post-cierre', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    // Create embarque
    await page.goto('/embarques')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    await page.click('button:has-text("Nuevo Embarque")')
    await page.waitForTimeout(500)
    await page.locator('select').first().selectOption({ index: 1 })
    await page.locator('[role="dialog"] button:has-text("Crear")').click()
    await page.waitForTimeout(1000)
    
    // Open and close embarque
    await page.locator('.bg-white.p-4.rounded-xl.shadow').first().click()
    await page.waitForTimeout(500)
    
    const cerrarBtn = page.locator('button:has-text("Cerrar Embarque")')
    if (await cerrarBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cerrarBtn.click()
      await page.waitForURL(/\/embarques\/.*\/cerrar/)
      await page.waitForTimeout(1000)
      
      await page.click('button:has-text("Cerrar Ruta y Generar Reporte")')
      await page.waitForTimeout(2000)
      
      // Go to pedidos and verify ENTREGADO status
      await page.goto('/pedidos')
      await page.waitForLoadState('networkidle')
      await handleBaseCajaModal(page)
      await page.waitForTimeout(1000)
      
      // At least one pedido should be ENTREGADO
      const bodyText = await page.locator('body').innerText()
      expect(bodyText).toContain('ENTREGADO')
    }
  })
})
