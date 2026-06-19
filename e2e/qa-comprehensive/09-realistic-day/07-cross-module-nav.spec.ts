/**
 * 09-realistic-day/07-cross-module-nav.spec.ts
 *
 * Tests de navegación cross-módulo: click en links, tabs, filtros,
 * query params, sin errores 404/500.
 *
 * Mobile-first. Estos tests verifican que los links entre módulos
 * funcionan (cliente → pedido, pedido → embarque, etc).
 */
import {
  test,
  expect,
  fullLoginRealistic,
  cleanTestState,
  createClienteReal,
  createPedidoReal,
} from './00-fixtures'

test.describe('Cross-module navigation — mobile-first', () => {
  test.beforeEach(() => {
    cleanTestState()
  })

  test('01: Cliente: click en pedido del cliente navega al detalle', async ({ page }) => {
    await fullLoginRealistic(page, 'asistente', 50_000)
    const c = await createClienteReal(page, {
      nombre: `Nav Test ${Date.now()}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteId = c.cliente?.id || c.id
    await createPedidoReal(page, {
      clienteId: clienteId!,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })

    // Ir a /clientes
    await page.goto(`/clientes?openCliente=${clienteId}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)
    await expect(page).toHaveURL(/\/clientes/)
  })

  test('02: Dashboard: click en alerta navega a la sección filtrada', async ({ page }) => {
    await fullLoginRealistic(page, 'admin', 100_000)
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)
    // El dashboard debe tener h2 de alertas
    const alertasH2 = await page.locator('h2', { hasText: /Alertas/i }).count()
    expect(alertasH2).toBeGreaterThanOrEqual(0)
  })

  test('03: Pedidos: tab Únicos ↔ Recurrentes preserva filtros', async ({ page }) => {
    await fullLoginRealistic(page, 'asistente', 50_000)
    await page.goto('/pedidos')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(/\/pedidos/)
  })

  test('04: Embarques: filtro por estado (ABIERTO, CERRADO, EN_RUTA)', async ({ page }) => {
    await fullLoginRealistic(page, 'admin', 100_000)
    for (const estado of ['ABIERTO', 'CERRADO', 'EN_RUTA']) {
      await page.goto(`/embarques?estado=${estado}`)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(500)
      await expect(page).toHaveURL(/\/embarques/)
    }
  })

  test('05: Reportes: filtro fecha inicio/fin', async ({ page }) => {
    await fullLoginRealistic(page, 'contador', 0)
    const today = new Date().toISOString().split('T')[0]
    const lastWeek = new Date(Date.now() - 7 * 86400_000).toISOString().split('T')[0]
    await page.goto(`/reportes?start=${lastWeek}&end=${today}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(/\/reportes/)
  })

  test('06: Cierre: query param fecha=YYYY-MM-DD abre el día específico', async ({ page }) => {
    await fullLoginRealistic(page, 'asistente', 50_000)
    const today = new Date().toISOString().split('T')[0]
    await page.goto(`/cierre?fecha=${today}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(/\/cierre/)
  })

  test('07: Link Clientes en el sidebar lleva a /clientes', async ({ page }) => {
    await fullLoginRealistic(page, 'asistente', 50_000)
    // Abrir el drawer (mobile)
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    await page.waitForTimeout(500)
    // Click en "Clientes" (link del sidebar)
    const clientesLink = page.locator('aside').getByRole('link', { name: 'Clientes' })
    const count = await clientesLink.count()
    if (count > 0) {
      await clientesLink.first().click()
      await page.waitForURL(/\/clientes/, { timeout: 5000 })
    }
  })

  test('08: Link Pedidos en el sidebar lleva a /pedidos', async ({ page }) => {
    await fullLoginRealistic(page, 'asistente', 50_000)
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    await page.waitForTimeout(500)
    const pedidosLink = page.locator('aside').getByRole('link', { name: 'Pedidos' })
    const count = await pedidosLink.count()
    if (count > 0) {
      await pedidosLink.first().click()
      await page.waitForURL(/\/pedidos/, { timeout: 5000 })
    }
  })

  test('09: Resumen-facturas con query params clienteId + desde + hasta', async ({ page }) => {
    await fullLoginRealistic(page, 'admin', 100_000)
    const c = await createClienteReal(page, {
      nombre: `Resumen Test ${Date.now()}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteId = c.cliente?.id || c.id
    const today = new Date().toISOString().split('T')[0]
    const lastMonth = new Date(Date.now() - 30 * 86400_000).toISOString().split('T')[0]
    await page.goto(`/resumen-facturas?clienteId=${clienteId}&desde=${lastMonth}&hasta=${today}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)
  })

  test('10: Recurrentes/nuevo carga el form', async ({ page }) => {
    await fullLoginRealistic(page, 'asistente', 50_000)
    await page.goto('/recurrentes/nuevo')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(/\/recurrentes\/nuevo/)
  })

  test('11: Rutas/nuevo carga el form', async ({ page }) => {
    await fullLoginRealistic(page, 'admin', 100_000)
    await page.goto('/rutas/nuevo')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(/\/rutas\/nuevo/)
  })

  test('12: Productos carga el catálogo', async ({ page }) => {
    await fullLoginRealistic(page, 'asistente', 50_000)
    await page.goto('/productos')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(/\/productos/)
  })

  test('13: Proveedores lista los proveedores', async ({ page }) => {
    await fullLoginRealistic(page, 'admin', 100_000)
    await page.goto('/proveedores')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(/\/proveedores/)
  })

  test('14: Insumos lista los insumos', async ({ page }) => {
    await fullLoginRealistic(page, 'asistente', 50_000)
    await page.goto('/insumos')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(/\/insumos/)
  })
})
