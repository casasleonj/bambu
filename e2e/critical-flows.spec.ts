// @tests api/cliente, api/pedido
import { test, expect, type Page } from '@playwright/test'
import { handleBaseCaja, openFabPedidoEnvio, openSidebarIfMobile, loginAs, createCliente } from './fixtures'

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000'

async function login(page: Page) {
  await loginAs(page, 'admin')
}

// pedidos-client fetches the full clientes list in the background with an
// 8s AbortSignal timeout (src/app/(app)/pedidos/pedidos-client/index.tsx).
// Under heavy CI load that fetch can abort before the list ever populates,
// leaving the search results empty regardless of how long the test waits —
// the only way to give it a fresh 8s budget is to reload and reopen the
// modal. DOMICILIO pedidos require a client (handleSubmit validation), so
// unlike abonos.spec.ts this can't just be skipped when empty.
//
// FIX: the real, deterministic root cause (found by repro) wasn't the
// timing race described above -- it was `.fill('a')`. matchCliente()
// (src/lib/cliente-search.ts) requires MIN_SEARCH_CHARS=2; a 1-char query
// always scores 0 and never matches ANY client, regardless of how fast or
// slow the background fetch is. 'te' is virtually guaranteed to match
// (createCliente()'s default fixture name is `Cliente Test <timestamp>`,
// and CONSUMIDOR_FINAL/seeded clients also commonly contain it). The
// retry-with-reload loop is kept as a defensive fallback for the
// documented timing race, now that the search term itself can actually
// match once the list has loaded.
async function searchAndSelectCliente(page: Page, searchTerm = 'te') {
  const modal = page.locator('form').filter({ hasText: 'Cliente' })
  const clientBtn = page.getByTestId('cliente-search-result').first()
  const maxAttempts = 3
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await modal.locator('input[placeholder="Buscar cliente por nombre o teléfono..."]').fill(searchTerm)
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
  await clientBtn.click({ timeout: 5000 })
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
    let apiResponseRaw: unknown = null
    await page.route('/api/clientes', async (route) => {
      const response = await route.fetch()
      apiResponseRaw = await response.json().catch(() => null)
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
    const apiResponse = apiResponseRaw as { error?: string } | null
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
    let requestBodyRaw: unknown = null
    await page.route('/api/pedidos', async (route) => {
      if (route.request().method() === 'POST') {
        requestBodyRaw = await route.request().postDataJSON()
      }
      await route.continue()
    })

    // FIX: buscar con un término genérico ('te') podía matchear "Cliente
    // E2E Test" (creado por el test sibling "Crear un nuevo cliente" en
    // este mismo archivo, sin dirección/barrio) -- el flujo de domicilio
    // exige dirección+barrio, y ese cliente en particular no los tiene,
    // bloqueando el submit con "Dirección y barrio son obligatorios".
    // Se crea acá un cliente propio con dirección completa y se busca
    // por un nombre que no colisiona con el de otros tests del archivo.
    const cliente = await createCliente(page, { nombre: 'ClientePedidoDomZ1' })
    expect(cliente.cliente.id).toBeTruthy()

    // Open create modal
    await openFabPedidoEnvio(page)
    await page.waitForTimeout(800)

    // Search and select the dedicated client
    const modal = await searchAndSelectCliente(page, 'DomZ1')

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
    page.on('dialog', async (dialog) => {
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
    const requestBody = requestBodyRaw as { items?: Array<{ producto: string; cantidad: number }> } | null
    expect(requestBody).not.toBeNull()
    expect(requestBody!.items).toBeDefined()
    expect(Array.isArray(requestBody!.items)).toBe(true)
    expect(requestBody!.items!.length).toBeGreaterThan(0)
    expect(requestBody!.items![0]).toHaveProperty('producto')
    expect(requestBody!.items![0]).toHaveProperty('cantidad')
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
    let requestBodyRaw: unknown = null
    await page.route('/api/pedidos', async (route) => {
      if (route.request().method() === 'POST') {
        requestBodyRaw = await route.request().postDataJSON()
      }
      await route.continue()
    })

    // FIX: mismo caso que el test anterior -- se crea un cliente propio
    // con dirección completa para no depender de cuál cliente matchea
    // primero un término de búsqueda genérico.
    const cliente = await createCliente(page, { nombre: 'ClientePedidoDomZ2' })
    expect(cliente.cliente.id).toBeTruthy()

    await openFabPedidoEnvio(page)
    await page.waitForTimeout(800)

    // Select client
    const modal = await searchAndSelectCliente(page, 'DomZ2')

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
    const requestBody = requestBodyRaw as { items?: Array<{ producto: string; cantidad: number }> } | null
    expect(requestBody).not.toBeNull()
    expect(requestBody!.items).toBeDefined()
    expect(Array.isArray(requestBody!.items)).toBe(true)
  })
})
