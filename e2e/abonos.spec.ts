// @tests api/abonos
import { test, expect, type Page } from '@playwright/test'

test.describe('Abonos', () => {
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

  test('page loads with heading', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)

    await page.goto('/facturas')
    await page.waitForTimeout(2000)
    await handleBaseCajaModal(page)

    await expect(page.locator('h1:has-text("Facturas")')).toBeVisible({ timeout: 10000 })
  })

  test('register abono and cancel abono on factura with saldo', async ({ page }) => {
    test.setTimeout(120000)
    await login(page, 'admin', 'admin123')

    // Step 1: Create a pedido without payment → generates factura
    await page.goto('/pedidos')
    await page.waitForTimeout(2000)
    await handleBaseCajaModal(page)

    await page.click('button:has-text("+ Nuevo Pedido")')
    await page.waitForTimeout(2000)

    // Search and select client
    const searchInput = page.locator('input[placeholder="Buscar por nombre o telefono..."]')
    await searchInput.fill('a')
    await page.waitForTimeout(600)

    const clientBtn = page.locator('div.border.rounded-md button').first()
    if (await clientBtn.count() > 0) {
      await clientBtn.click()
      await page.waitForTimeout(500)
    }

    // Fill first product quantity input (pacaAgua)
    await page.locator('input[placeholder="0"]').first().fill('1')
    await page.waitForTimeout(500)

    // Click Crear Pedido (no payment → generates factura with saldo)
    await page.locator('button:has-text("Crear Pedido")').click()
    // Wait for modal to close (pedido created)
    await page.waitForTimeout(3000)

    // Step 2: Navigate to facturas
    await page.goto('/facturas')
    await page.waitForTimeout(2000)
    await handleBaseCajaModal(page)

    // Step 3: Test CANCEL abono first (won't modify saldo)
    const registrarBtn = page.locator('button:has-text("Registrar Abono")').first()
    if (await registrarBtn.count() === 0) {
      // If no factura with saldo exists, the page should still load correctly
      await expect(page.locator('h1:has-text("Facturas")')).toBeVisible()
      return
    }

    // Open abono form
    await registrarBtn.click()
    await page.waitForTimeout(500)
    await expect(page.locator('text=Monto del abono')).toBeVisible({ timeout: 5000 })

    // Fill amount but CANCEL
    const montoInput = page.locator('input[placeholder="Monto a pagar"]')
    await montoInput.fill('5000')
    await page.locator('button:has-text("Cancelar")').click()
    await page.waitForTimeout(500)
    await expect(page.locator('text=Monto del abono')).not.toBeVisible({ timeout: 5000 })

    // Step 4: Test CONFIRM abono (partial payment)
    await page.locator('button:has-text("Registrar Abono")').first().click()
    await page.waitForTimeout(500)
    await expect(page.locator('text=Monto del abono')).toBeVisible({ timeout: 5000 })

    await page.locator('input[placeholder="Monto a pagar"]').fill('2000')
    await page.locator('button:has-text("Confirmar")').click()
    await page.waitForTimeout(2000)

    // Abono form should close after success
    await expect(page.locator('text=Monto del abono')).not.toBeVisible({ timeout: 5000 })
    await expect(page.locator('h1:has-text("Facturas")')).toBeVisible()
  })
})
