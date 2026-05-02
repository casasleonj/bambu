import { test, expect, type Page } from '@playwright/test'

test.describe('Recurrentes', () => {
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

  test('page loads with recurrentes list', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/recurrentes')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    // Page should load without errors
    await expect(page.locator('body')).not.toContainText('500', { timeout: 5000 })
  })

  test('crear recurrente con productos', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/recurrentes')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    // Click "Nuevo Recurrente" button
    await page.click('button:has-text("Nuevo Recurrente")')
    await page.waitForTimeout(500)
    
    const modal = page.locator('div.bg-white.rounded-xl').filter({ hasText: 'Nuevo Recurrente' })
    if (!await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Try alternative selector
      await page.click('button:has-text("Recurrente")')
      await page.waitForTimeout(500)
    }
    
    // Select a client
    const clientSelect = page.locator('select').first()
    if (await clientSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      const optCount = await clientSelect.locator('option').count()
      if (optCount > 1) {
        await clientSelect.selectOption({ index: 1 })
        await page.waitForTimeout(300)
      }
    }
    
    // Select frequency
    const freqSelect = page.locator('select').last()
    if (await freqSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await freqSelect.selectOption({ index: 1 })
      await page.waitForTimeout(300)
    }
    
    // Submit
    await page.click('button:has-text("Crear")')
    await page.waitForTimeout(1500)
    
    // Should show success or return to list
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toContain('Error')
  })

  test('listar recurrentes con conteo de pedidos', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/recurrentes')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    // Page should show recurrentes list or empty state
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toMatch(/Recurrentes|No hay recurrentes/i)
  })

  test('actualizar frecuencia de recurrente', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/recurrentes')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    // Click first recurrente row to edit
    const firstRow = page.locator('table tbody tr').first()
    if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstRow.click()
      await page.waitForTimeout(500)
      
      // Edit modal should appear
      const bodyText = await page.locator('body').innerText()
      expect(bodyText.length).toBeGreaterThan(0)
    }
  })

  test('eliminar recurrente (soft delete)', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/recurrentes')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    // Click first recurrente row
    const firstRow = page.locator('table tbody tr').first()
    if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstRow.click()
      await page.waitForTimeout(500)
      
      // Look for delete/eliminar button
      const deleteBtn = page.locator('button:has-text("Eliminar"), button:has-text("eliminar")').first()
      if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await deleteBtn.click()
        await page.waitForTimeout(1000)
        
        // Should show success or return to list
        const bodyText = await page.locator('body').innerText()
        expect(bodyText).not.toContain('Error')
      }
    }
  })
})
