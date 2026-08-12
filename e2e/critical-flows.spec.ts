// @tests api/cliente, api/pedido
import { test, expect, type Page } from '@playwright/test'
import { handleBaseCaja, openFabPedidoEnvio, openSidebarIfMobile } from './fixtures'

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000'

async function login(page: any) {
  await page.goto(`${BASE_URL}/login`)
  await page.fill('input[type="text"]', 'admin')
  await page.fill('input[type="password"]', 'admin123')
  await page.click('button:has-text("Ingresar")')
  await page.waitForURL(/.*dashboard/, { timeout: 15000 })
}

// pedidos-client fetches the full clientes list in the background with an
// 8s AbortSignal timeout (src/app/(app)/pedidos/pedidos-client/index.tsx).
// Under heavy CI load that fetch can abort before the list ever populates,
// leaving the search results empty regardless of how long the test waits —
// the only way to give it a fresh 8s budget is to reload and reopen the
// modal. DOMICILIO pedidos require a client (handleSubmit validation), so
// unlike abonos.spec.ts this can't just be skipped when empty.
async function searchAndSelectCliente(page: Page) {
  const modal = page.locator('form').filter({ hasText: 'Cliente' })
  const clientBtn = page.getByTestId('cliente-search-result').first()
  const maxAttempts = 3
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await modal.locator('input[placeholder="Buscar cliente por nombre o teléfono..."]').fill('a')
    if (await clientBtn.isVisible({ timeout: 15000 }).catch(() => false)) {
      await clientBtn.click()
      return modal
    }
    if (attempt < maxAttempts - 1) {
      await page.reload()
      await page.waitForLoadState('networkidle')
      await handleBaseCaja(page)
      await openFabPedidoEnvio(page)
      await page.waitForTimeout(800)
    }
  }
  await clientBtn.click()
  return modal
}

test.describe('Flujos críticos de negocio', () => {

  test('Crear un nuevo cliente', async ({ page }) => {
    await login(page)
    await handleBaseCaja(page)

    await page.goto(`${BASE_URL}/clientes`)
    await page.waitForLoadState('networkidle')
    await handleBaseCaja(page)

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
    await handleBaseCaja(page)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain('Cliente E2E Test')
  })

  test('Crear un pedido con pago via items array', async ({ page }) => {
    await login(page)
    await handleBaseCaja(page)

    await page.goto(`${BASE_URL}/pedidos`)
    await page.waitForLoadState('networkidle')
    await handleBaseCaja(page)

    // Intercept API request to verify items array
    let requestBody: any = null
    await page.route('/api/pedidos', async (route) => {
      if (route.request().method() === 'POST') {
        requestBody = await route.request().postDataJSON()
      }
      await route.continue()
    })

    // Open create modal
    await openFabPedidoEnvio(page)
    await page.waitForTimeout(800)

    // Search and select first client
    const modal = await searchAndSelectCliente(page)

    // Add product
    const aguaInput = modal.locator('input[type="number"]').first()
    await aguaInput.fill('2')

    // Set payment - click chip first, then enter amount
    await modal.locator('button:has-text("Efectivo")').click()
    await page.waitForTimeout(300)
    const pagoInput = modal.locator('input[type="number"]').last()
    await pagoInput.fill('13000')
    await pagoInput.blur()
    await page.waitForTimeout(300)

    // Submit
    let alertMsg = null
    page.on('dialog', async (dialog: any) => {
      alertMsg = dialog.message()
      await dialog.accept()
    })

    await modal.getByTestId('submit-pedido').click()
    await page.waitForTimeout(1000)

    // Should close modal (no alert about missing client/payment)
    expect(alertMsg).toBeNull()

    // Verify we're back on pedidos list
    await expect(page.locator('body')).toContainText('Pedidos')

    // Verify API received items array
    expect(requestBody).not.toBeNull()
    expect(requestBody.items).toBeDefined()
    expect(Array.isArray(requestBody.items)).toBe(true)
    expect(requestBody.items.length).toBeGreaterThan(0)
    expect(requestBody.items[0]).toHaveProperty('producto')
    expect(requestBody.items[0]).toHaveProperty('cantidad')
  })

  test('Dashboard muestra secciones principales', async ({ page }) => {
    await login(page)
    await handleBaseCaja(page)

    // Wait for dashboard to fully load
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).toContainText('Ventas por Precio', { timeout: 10000 })
    await expect(page.locator('body')).toContainText('Acciones Rápidas')
    await expect(page.locator('body')).toContainText('Inventario')
    await expect(page.locator('body')).toContainText('Resumen de Caja')
    await expect(page.locator('body')).toContainText('Cartera')
  })

  test('Sidebar tiene logout y configuración', async ({ page }) => {
    await login(page)
    await handleBaseCaja(page)
    await openSidebarIfMobile(page)

    await expect(page.locator('text=Cerrar Sesión')).toBeVisible()
    await expect(page.locator('text=Configuración')).toBeVisible()
  })

  test('Pedido agendado sin pago es permitido via items array', async ({ page }) => {
    await login(page)
    await handleBaseCaja(page)

    await page.goto(`${BASE_URL}/pedidos`)
    await page.waitForLoadState('networkidle')
    await handleBaseCaja(page)

    // Intercept to verify items array
    let requestBody: any = null
    await page.route('/api/pedidos', async (route) => {
      if (route.request().method() === 'POST') {
        requestBody = await route.request().postDataJSON()
      }
      await route.continue()
    })

    await openFabPedidoEnvio(page)
    await page.waitForTimeout(800)

    // Select client
    const modal = await searchAndSelectCliente(page)

    // Add product
    await modal.locator('input[type="number"]').first().fill('1')

    // No payment added - pedido agendado sin pago es permitido

    // Intercept API response to verify actual success
    const [apiResponse] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/api/pedidos') && resp.request().method() === 'POST'),
      modal.getByTestId('submit-pedido').click(),
    ])

    expect(apiResponse.status()).toBe(201)

    // Verify pedido appears in list (PENDIENTE state for non-ventaRapida order)
    await page.waitForTimeout(500)
    await expect(page.getByText('PENDIENTE').first()).toBeVisible()

    // Verify API used items array
    expect(requestBody).not.toBeNull()
    expect(requestBody.items).toBeDefined()
    expect(Array.isArray(requestBody.items)).toBe(true)
  })
})
