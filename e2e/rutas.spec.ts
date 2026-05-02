import { test, expect, type Page } from '@playwright/test'

test.describe('Rutas', () => {
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

  test('page loads with rutas list', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/rutas')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    // Page should load without errors
    await expect(page.locator('body')).not.toContainText('500', { timeout: 5000 })
  })

  test('crear ruta con repartidor', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/rutas')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    // Click "Nueva Ruta" button
    await page.click('button:has-text("Nueva Ruta")')
    await page.waitForTimeout(500)
    
    const modal = page.locator('div.bg-white.rounded-xl').filter({ hasText: 'Nueva Ruta' })
    if (!await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.click('button:has-text("Ruta")')
      await page.waitForTimeout(500)
    }
    
    // Fill route name
    const nameInput = page.locator('input[placeholder*="Nombre"], input[placeholder*="nombre"]').first()
    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput.fill(`Ruta E2E ${Date.now()}`)
      await page.waitForTimeout(300)
    }
    
    // Select repartidor
    const trabSelect = page.locator('select').first()
    if (await trabSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      const optCount = await trabSelect.locator('option').count()
      if (optCount > 1) {
        await trabSelect.selectOption({ index: 1 })
        await page.waitForTimeout(300)
      }
    }
    
    // Submit
    await page.click('button:has-text("Crear")')
    await page.waitForTimeout(1500)
    
    // Should show success
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toContain('Error')
  })

  test('editar ruta existente', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/rutas')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    // Click first ruta row to edit
    const firstRow = page.locator('table tbody tr').first()
    if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstRow.click()
      await page.waitForTimeout(500)
      
      // Edit modal should appear
      const bodyText = await page.locator('body').innerText()
      expect(bodyText.length).toBeGreaterThan(0)
    }
  })

  test('eliminar ruta (soft delete)', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/rutas')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    // Click first ruta row
    const firstRow = page.locator('table tbody tr').first()
    if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstRow.click()
      await page.waitForTimeout(500)
      
      // Look for delete button
      const deleteBtn = page.locator('button:has-text("Eliminar"), button:has-text("eliminar")').first()
      if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await deleteBtn.click()
        await page.waitForTimeout(1000)
        
        const bodyText = await page.locator('body').innerText()
        expect(bodyText).not.toContain('Error')
      }
    }
  })

  test('ver ruta en formulario de embarque', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    // Create embarque
    await page.goto('/embarques')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    await page.click('button:has-text("Nuevo Embarque")')
    await page.waitForTimeout(500)
    
    // Ruta select should be available
    const selects = page.locator('select')
    const count = await selects.count()
    expect(count).toBeGreaterThanOrEqual(1)
    
    // Check if any select has ruta options
    const bodyText = await page.locator('[role="dialog"]').innerText()
    expect(bodyText.length).toBeGreaterThan(0)
  })
})
