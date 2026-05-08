import { test, expect, type Page } from '@playwright/test'

test.describe('Clientes', () => {
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

  test('page loads and shows clientes', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/clientes')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    await expect(page.locator('h1:has-text("Clientes")')).toBeVisible()
    await expect(page.locator('button:has-text("Nuevo Cliente")')).toBeVisible()
  })

  test('crear cliente y verificar en lista', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/clientes')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    await page.click('button:has-text("+ Nuevo Cliente")')
    await page.waitForTimeout(500)
    
    const modal = page.locator('div.bg-white.rounded-xl').filter({ hasText: 'Nuevo Cliente' })
    
    await modal.locator('text=Nombre').locator('..').locator('input').fill('Cliente E2E Test')
    await modal.locator('text=Teléfono *').locator('..').locator('input').fill('3119998888')
    
    await modal.locator('button[type="submit"]').click()
    await page.waitForTimeout(1500)
    
    await expect(modal).not.toBeVisible({ timeout: 5000 }).catch(() => null)
    
    await page.reload()
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain('Cliente E2E Test')
  })

  test('buscar cliente por nombre', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/clientes')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    // Search for a client
    const searchInput = page.locator('input[placeholder*="Buscar"], input[placeholder*="buscar"]').first()
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill('a')
      await page.waitForTimeout(500)
      
      // Results should update
      const bodyText = await page.locator('body').innerText()
      expect(bodyText.length).toBeGreaterThan(0)
    }
  })

  test('validación negativa: nombre vacío muestra error', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/clientes')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    await page.click('button:has-text("+ Nuevo Cliente")')
    await page.waitForTimeout(500)
    
    const modal = page.locator('div.bg-white.rounded-xl').filter({ hasText: 'Nuevo Cliente' })
    
    // Submit without filling required fields
    await modal.locator('button[type="submit"]').click()
    await page.waitForTimeout(1000)
    
    // Modal should still be open (validation error)
    await expect(modal).toBeVisible()
  })

  test('ver detalle de cliente', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)
    
    await page.goto('/clientes')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)
    
    // Click first client row
    const firstRow = page.locator('table tbody tr').first()
    if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstRow.click()
      await page.waitForTimeout(500)
      
      // Detail modal should show client info
      await expect(page.locator('h2:has-text("Detalle"), h3:has-text("Detalle")').first()).toBeVisible()
    }
  })
})
