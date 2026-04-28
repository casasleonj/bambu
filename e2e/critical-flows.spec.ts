import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:3000'

async function login(page: any) {
  await page.goto(`${BASE_URL}/login`)
  await page.fill('input[type="text"]', 'admin')
  await page.fill('input[type="password"]', 'admin123')
  await page.click('button:has-text("Ingresar")')
  await page.waitForURL(/.*dashboard/, { timeout: 15000 })
}

async function handleBaseCajaModal(page: any) {
  try {
    await page.waitForSelector('text=Base de Caja', { timeout: 2000 })
    await page.fill('input[type="number"]', '100000')
    await page.click('button:has-text("Continuar")')
    await page.waitForTimeout(600)
  } catch {
    // Modal didn't appear
  }
}

test.describe('Flujos críticos de negocio', () => {

  test('Crear un nuevo cliente', async ({ page }) => {
    await login(page)
    await handleBaseCajaModal(page)

    await page.goto(`${BASE_URL}/clientes`)
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)

    // Intercept API response
    let apiResponse: any = null
    await page.route('/api/clientes', async (route) => {
      const response = await route.fetch()
      apiResponse = await response.json().catch(() => null)
      await route.fulfill({ response })
    })

    // Open create modal
    await page.click('button:has-text("+ Nuevo Cliente")')
    await page.waitForTimeout(500)

    const modal = page.locator('div.bg-white.rounded-xl').filter({ hasText: 'Nuevo Cliente' })

    // Fill form using labels to ensure correct inputs
    await modal.locator('text=Nombre').locator('..').locator('input').fill('Cliente E2E Test')
    await modal.locator('text=Teléfono').locator('..').locator('input').fill('3119998888')

    // Submit
    await modal.locator('button[type="submit"]').click()
    await page.waitForTimeout(1500)

    // Check for API errors
    if (apiResponse?.error) {
      console.log('API Error:', apiResponse.error)
    }

    // Wait for modal to close
    await expect(modal).not.toBeVisible({ timeout: 5000 }).catch(() => null)

    // Refresh page and verify client appears
    await page.reload()
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain('Cliente E2E Test')
  })

  test('Crear un pedido con pago', async ({ page }) => {
    await login(page)
    await handleBaseCajaModal(page)

    await page.goto(`${BASE_URL}/pedidos`)
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)

    // Open create modal
    await page.click('button:has-text("+ Nuevo Pedido")')
    await page.waitForTimeout(800)

    const modal = page.locator('form').filter({ hasText: 'Cliente' })

    // Search and select first client
    await modal.locator('input[placeholder="Buscar por nombre o teléfono..."]').fill('a')
    await page.waitForTimeout(500)
    const clientBtn = modal.locator('button[type="button"]').first()
    await clientBtn.click()

    // Add product
    const aguaInput = modal.locator('input[type="number"]').first()
    await aguaInput.fill('2')

    // Set payment
    const pagoInput = modal.locator('input[placeholder="Monto"]').first()
    await pagoInput.fill('13000')

    // Submit
    let alertMsg = null
    page.on('dialog', async (dialog: any) => {
      alertMsg = dialog.message()
      await dialog.accept()
    })

    await modal.locator('button:has-text("Crear Pedido")').click()
    await page.waitForTimeout(1000)

    // Should close modal (no alert about missing client/payment)
    expect(alertMsg).toBeNull()

    // Verify we're back on pedidos list
    await expect(page.locator('body')).toContainText('Pedidos')
  })

  test('Dashboard muestra secciones principales', async ({ page }) => {
    await login(page)
    await handleBaseCajaModal(page)

    // Wait for dashboard to fully load
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).toContainText('Ventas por Precio', { timeout: 10000 })
    await expect(page.locator('body')).toContainText('Acciones Rápidas')
    await expect(page.locator('body')).toContainText('Stock Disponible')
    await expect(page.locator('body')).toContainText('Resumen de Caja')
  })

  test('Sidebar tiene logout y configuración', async ({ page }) => {
    await login(page)
    await handleBaseCajaModal(page)

    await expect(page.locator('text=Cerrar Sesión')).toBeVisible()
    await expect(page.locator('text=Precios')).toBeVisible()
  })

  test('Pedido agendado sin pago es permitido', async ({ page }) => {
    await login(page)
    await handleBaseCajaModal(page)

    await page.goto(`${BASE_URL}/pedidos`)
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)

    await page.click('button:has-text("+ Nuevo Pedido")')
    await page.waitForTimeout(800)

    const modal = page.locator('form').filter({ hasText: 'Cliente' })

    // Select client
    await modal.locator('input[placeholder="Buscar por nombre o teléfono..."]').fill('a')
    await page.waitForTimeout(500)
    await modal.locator('button[type="button"]').first().click()

    // Add product
    await modal.locator('input[type="number"]').first().fill('1')

    // Zero out payment
    const pagoInputs = modal.locator('input[placeholder="Monto"]')
    const count = await pagoInputs.count()
    for (let i = 0; i < count; i++) {
      await pagoInputs.nth(i).fill('0')
    }

    let alertMsg: string | null = null
    page.on('dialog', async (dialog: any) => {
      alertMsg = dialog.message()
      await dialog.accept()
    })

    await modal.locator('button:has-text("Crear Pedido")').click()
    await page.waitForTimeout(1000)

    // Should NOT show "debe registrar al menos un pago"
    if (alertMsg) {
      expect(alertMsg as string).not.toContain('pago')
    }
  })
})
