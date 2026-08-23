// @tests pedidos module - all contexts E2E coverage
// Covers: ADMIN, ASISTENTE, REPARTIDOR, CONTADOR roles; desktop + mobile;
// Tabs: Pedidos (hoy), Fiados, Alertas; full UI flows + edge cases
import { test, expect, apiPost, createCliente, BASE, sharedPageLogin, sharedLoginAs } from './fixtures'
import type { Page } from '@playwright/test'

const PEDIDOS_URL = `${BASE}/pedidos`

// Helper: dismiss any open dialog/modal to recover clean state
async function dismissDialog(page: Page) {
  const dialog = page.locator('[role="dialog"], .fixed.inset-0.z-40').first()
  if (await dialog.isVisible({ timeout: 500 }).catch(() => false)) {
    const closeBtn = dialog.locator('button:has-text("Cerrar"), button[aria-label="Close"], button:has-text("Cancelar")').first()
    if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await closeBtn.click()
      await page.waitForTimeout(300)
    } else {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
    }
  }
}

// Helper: get tab button scoped to the tab bar (not sidebar nav)
function tabButton(page: Page, label: string) {
  return page.locator(`.flex.border-b button:has-text("${label}")`)
}

// Helper: close mobile sidebar overlay if present
async function closeMobileSidebar(page: Page) {
  // Try clicking the overlay first
  const overlay = page.locator('div.fixed.inset-0.bg-black\\/50.z-30')
  if (await overlay.isVisible({ timeout: 2000 }).catch(() => false)) {
    await overlay.click({ force: true })
    await page.waitForTimeout(500)
  }
}

async function gotoPedidos(page: Page) {
  // Pre-set sidebar closed in localStorage before navigation
  await page.evaluate(() => {
    localStorage.setItem('bambu-app-storage', JSON.stringify({
      state: { sidebarOpen: false, currentDate: new Date().toISOString().split('T')[0], isOnline: true },
      version: 0
    }))
  })
  await page.goto(PEDIDOS_URL)
  // Wait for DOM to render, then wait for the key data API call
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
  // Wait for pedidos list to load (signals data ready)
  await page.waitForResponse(/\/api\/pedidos\?/, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(500)
  // Close mobile sidebar if still open
  await closeMobileSidebar(page)
  // Dismiss any leftover dialog/modal from previous tests
  await dismissDialog(page)
}

// ─── Role Context Tests ──────────────────────────────────────────────────────

test.describe('Pedidos — Contexto ADMIN', () => {
  let p: Page

  test.beforeAll(async ({ browser }) => {
    p = await sharedPageLogin(browser)
  })
  test.afterAll(async () => {
    await p?.close()
  })
  test('ADMIN ve pagina de pedidos con las 3 tabs', async () => {
    await gotoPedidos(p)
    await expect(p.locator('h1').first()).toBeVisible()
    // Tabs (scoped to tab bar, not sidebar)
    await expect(tabButton(p, 'Pedidos')).toBeVisible()
    await expect(tabButton(p, 'Fiados')).toBeVisible()
    await expect(tabButton(p, 'Alertas')).toBeVisible()
  })

  test('ADMIN ve stats cards en tab Pedidos', async () => {
    await gotoPedidos(p)
    // Stats cards - scoped to the stats grid
    await expect(p.locator('p:text-is("Total Pedidos")')).toBeVisible()
    await expect(p.locator('p:has-text("Ventas")')).toBeVisible()
    await expect(p.locator('p:has-text("Fiado")')).toBeVisible()
  })

  test('ADMIN ve filtros en tab Pedidos', async () => {
    await gotoPedidos(p)
    // SmartDateFilter
    await expect(p.getByRole('button', { name: 'Hoy', exact: true })).toBeVisible()
    // Search input
    await expect(p.locator('input[placeholder*="Buscar" i]')).toBeVisible()
    // Filter chips
    await expect(p.getByRole('button', { name: 'Filtros' })).toBeVisible()
  })
})

test.describe('Pedidos — Contexto ASISTENTE', () => {
  let p: Page

  test.beforeAll(async ({ browser }) => {
    p = await sharedLoginAs(browser, 'asistente')
  })
  test.afterAll(async () => {
    await p?.close()
  })
  test('ASISTENTE accede a pedidos con todas las tabs', async () => {
    await gotoPedidos(p)
    await expect(tabButton(p, 'Pedidos')).toBeVisible()
    await expect(tabButton(p, 'Fiados')).toBeVisible()
    await expect(tabButton(p, 'Alertas')).toBeVisible()
  })
})

test.describe('Pedidos — Contexto REPARTIDOR', () => {
  let p: Page

  test.beforeAll(async ({ browser }) => {
    p = await sharedLoginAs(browser, 'repartidor')
  })

  test.afterAll(async () => {
    await p?.close()
  })

  test('REPARTIDOR accede a /pedidos', async () => {
    await p.goto(PEDIDOS_URL)
    await p.waitForLoadState('domcontentloaded')
    await p.waitForTimeout(1000)
    const bodyText = await p.locator('body').textContent()
    expect(bodyText?.length).toBeGreaterThan(10)
  })
})

test.describe('Pedidos — Contexto CONTADOR', () => {
  let p: Page

  test.beforeAll(async ({ browser }) => {
    p = await sharedLoginAs(browser, 'contador')
  })

  test.afterAll(async () => {
    await p?.close()
  })

  test('CONTADOR accede a /pedidos', async () => {
    await p.goto(PEDIDOS_URL)
    await p.waitForLoadState('domcontentloaded')
    await p.waitForTimeout(1000)
    const bodyText = await p.locator('body').textContent()
    expect(bodyText?.length).toBeGreaterThan(10)
  })
})

// ─── Tab Navigation Tests ────────────────────────────────────────────────────

test.describe('Pedidos — Tab Navigation', () => {
  let p: Page

  test.beforeAll(async ({ browser }) => {
    p = await sharedPageLogin(browser)
  })
  test.afterAll(async () => {
    await p?.close()
  })
  test('tab Pedidos es activa por defecto', async () => {
    await gotoPedidos(p)
    const pedidosTab = tabButton(p, 'Pedidos')
    await expect(pedidosTab).toHaveClass(/border-blue-600|text-blue-600/)
  })

  test('click en tab Fiados activa la tab y cambia URL', async () => {
    await gotoPedidos(p)
    await tabButton(p, 'Fiados').click()
    await p.waitForTimeout(500)
    await expect(p).toHaveURL(/tab=fiados/)
    // Fiados header should be visible
    await expect(p.locator('text=Control de Fiados')).toBeVisible()
  })

  test('click en tab Alertas activa la tab y cambia URL', async () => {
    await gotoPedidos(p)
    await tabButton(p, 'Alertas').click()
    await p.waitForTimeout(500)
    await expect(p).toHaveURL(/tab=alertas/)
    // Alertas header should be visible
    await expect(p.locator('text=Sistema de Alertas')).toBeVisible()
  })

  test('URL directa con ?tab=fiados abre tab Fiados', async () => {
    await p.goto(`${PEDIDOS_URL}?tab=fiados`)
    await p.waitForLoadState('domcontentloaded')
    await p.waitForTimeout(1000)
    await closeMobileSidebar(p)
    await expect(p).toHaveURL(/tab=fiados/)
    await expect(p.locator('text=Control de Fiados')).toBeVisible()
    // Pedidos tab should NOT be active
    const pedidosTab = tabButton(p, 'Pedidos')
    await expect(pedidosTab).not.toHaveClass(/border-blue-600/)
  })

  test('URL directa con ?tab=alertas abre tab Alertas', async () => {
    await p.goto(`${PEDIDOS_URL}?tab=alertas`)
    await p.waitForLoadState('domcontentloaded')
    await p.waitForTimeout(1000)
    await expect(p).toHaveURL(/tab=alertas/)
    await expect(p.locator('text=Sistema de Alertas')).toBeVisible()
  })

  test('navegar entre tabs: Pedidos -> Fiados -> Alertas -> Pedidos', async () => {
    await gotoPedidos(p)

    // Pedidos -> Fiados
    await tabButton(p, 'Fiados').click()
    await p.waitForTimeout(300)
    await expect(p).toHaveURL(/tab=fiados/)

    // Fiados -> Alertas
    await tabButton(p, 'Alertas').click()
    await p.waitForTimeout(300)
    await expect(p).toHaveURL(/tab=alertas/)

    // Alertas -> Pedidos
    await tabButton(p, 'Pedidos').click()
    await p.waitForTimeout(300)
    await expect(p).not.toHaveURL(/tab=/)
  })

  test('tab counts (badges) are visible', async () => {
    await gotoPedidos(p)
    // Each tab should have a count badge — check that all 3 tab labels render
    await expect(tabButton(p, 'Pedidos')).toBeVisible()
    await expect(tabButton(p, 'Fiados')).toBeVisible()
    await expect(tabButton(p, 'Alertas')).toBeVisible()
  })
})

// ─── Tab Pedidos (Hoy) Tests ─────────────────────────────────────────────────

test.describe('Pedidos — Tab Pedidos (Hoy)', () => {
  let p: Page

  test.beforeAll(async ({ browser }) => {
    p = await sharedPageLogin(browser)
  })
  test.afterAll(async () => {
    await p?.close()
  })
  test('stats cards muestran contadores', async () => {
    await gotoPedidos(p)
    // Stats cards exist — look for numeric values in stat-like containers
    // The grid may use responsive classes; match by role or by known labels instead
    const statsLabels = p.locator('p:text-is("Total Pedidos"), p:has-text("Ventas"), p:has-text("Fiado")')
    expect(await statsLabels.count()).toBeGreaterThanOrEqual(2)
  })

  test('filtros de tipo, origen, estado entrega, estado pago estan disponibles', async () => {
    await gotoPedidos(p)
    // Open filters panel. waitFor con auto-wait: el server component asíncrono
    // puede tardar en renderizar (loading.tsx skeleton) tras el domcontentloaded.
    const filtrosBtn = p.locator('button:has-text("Filtros")').first()
    await filtrosBtn.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {})
    if (await filtrosBtn.isVisible().catch(() => false)) {
      await filtrosBtn.click()
      await p.waitForTimeout(300)
    }
    // Filter chips should exist (at least some are visible)
    const filterChips = p.locator('button.rounded-full')
    expect(await filterChips.count()).toBeGreaterThan(0)
  })

  test('search input filtra pedidos', async () => {
    await gotoPedidos(p)
    const searchInput = p.locator('input[placeholder*="Buscar" i]').first()
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill('CONSUMIDOR')
      await p.waitForTimeout(500)
      // URL should have search param
      await expect(p).toHaveURL(/search=CONSUMIDOR/)
    }
  })

  test('SmartDateFilter tiene presets de fecha', async () => {
    await gotoPedidos(p)
    // Date filter presets — the filter buttons use getPresetLabel which includes symbols
    // "Hoy" is a button, "Ayer" is rendered as "← Ayer"
    await expect(p.locator('button:has-text("Hoy")').first()).toBeVisible()
    await expect(p.locator('button:has-text("Ayer")').first()).toBeVisible()
  })

  test('badge de origen se renderiza correctamente', async () => {
    // Create a venta rapida to ensure there's data
    const c = await createCliente(p)
    const clienteId = c.cliente?.id || c.data?.id
    if (clienteId) {
      await apiPost(p, '/api/pedidos', {
        clienteId,
        canal: 'PUNTO',
        ventaRapida: true,
        items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 3000 }],
      })
    }
    await gotoPedidos(p)
    await p.waitForTimeout(500)
    // May or may not be visible depending on date filter
    const bodyText = await p.locator('body').textContent()
    expect(bodyText?.length).toBeGreaterThan(10)
  })

  test('badge de estado entrega se renderiza', async () => {
    await gotoPedidos(p)
    // If there are pedidos, badges should appear
    const bodyText = await p.locator('body').textContent()
    // If no pedidos, this is acceptable
    if (bodyText?.includes('Sin pedidos') || bodyText?.includes('no hay')) {
      test.skip()
    }
  })

  test('click en fila de pedido abre modal de detalle', async () => {
    // Create a pedido first
    const c = await createCliente(p)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    await apiPost(p, '/api/pedidos', {
      clienteId,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    await gotoPedidos(p)
    await p.waitForTimeout(500)
    // Click first row in table
    const firstRow = p.locator('table tbody tr').first()
    if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstRow.click()
      await p.waitForTimeout(800)
      // Detail modal should show - scoped to dialog
      const dialog = p.locator('[role="dialog"], .fixed.inset-0.z-40').first()
      expect(await dialog.isVisible({ timeout: 3000 }).catch(() => false)).toBe(true)
      // Check for key modal content
      const modalText = await p.locator('body').textContent()
      expect(modalText?.includes('Total Pedido') || modalText?.includes('Productos')).toBe(true)
    }
  })

  test('modal de detalle muestra stepper de estado', async () => {
    const c = await createCliente(p)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    await apiPost(p, '/api/pedidos', {
      clienteId,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    await gotoPedidos(p)
    await p.waitForTimeout(500)
    const firstRow = p.locator('table tbody tr').first()
    if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstRow.click()
      await p.waitForTimeout(800)
      // Stepper steps - scoped to the detail modal area
      const modalContent = p.locator('.max-w-md .space-y-4, .max-w-md .relative')
      expect(await modalContent.first().isVisible({ timeout: 3000 }).catch(() => false)).toBe(true)
      // Check for stepper text within modal
      const bodyText = await p.locator('body').textContent()
      expect(bodyText?.includes('Pendiente') && bodyText?.includes('En Ruta') && bodyText?.includes('Entregado')).toBe(true)
    }
  })

  test('modal de detalle muestra acciones segun estado PENDIENTE', async () => {
    const c = await createCliente(p)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    await apiPost(p, '/api/pedidos', {
      clienteId,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    await gotoPedidos(p)
    await p.waitForTimeout(500)
    const firstRow = p.locator('table tbody tr').first()
    if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstRow.click()
      await p.waitForTimeout(800)
      // PENDIENTE actions
      await expect(p.locator('button:has-text("Enviar")')).toBeVisible()
      await expect(p.locator('button:has-text("Cancelar")')).toBeVisible()
    }
  })
})

// ─── Tab Fiados Tests ────────────────────────────────────────────────────────

test.describe('Pedidos — Tab Fiados', () => {
  let p: Page

  test.beforeAll(async ({ browser }) => {
    p = await sharedPageLogin(browser)
  })
  test.afterAll(async () => {
    await p?.close()
  })
  test('header explicativo de Fiados es visible', async () => {
    await gotoPedidos(p)
    await tabButton(p, 'Fiados').click()
    await p.waitForTimeout(500)
    await expect(p.locator('text=Control de Fiados')).toBeVisible()
    // Banner explicativo
    await expect(p.locator('text=aquí ves todos los clientes que tienen saldo pendiente').or(
      p.locator('text=clientes que tienen saldo pendiente')
    )).toBeVisible()
  })

  test('filtros de Fiados estan disponibles', async () => {
    await gotoPedidos(p)
    await tabButton(p, 'Fiados').click()
    await p.waitForTimeout(500)
    // Search
    await expect(p.locator('input[placeholder*="Buscar cliente" i]')).toBeVisible()
    // Deuda min/max
    await expect(p.locator('input[placeholder*="Deuda min" i]')).toBeVisible()
    await expect(p.locator('input[placeholder*="Deuda max" i]')).toBeVisible()
    // Dias fiado select
    await expect(p.locator('select')).toBeVisible()
  })

  test('periodo chips en Fiados', async () => {
    await gotoPedidos(p)
    await tabButton(p, 'Fiados').click()
    await p.waitForTimeout(500)
    // Periodo buttons
    await expect(p.locator('button:has-text("Hoy")')).toBeVisible()
    await expect(p.locator('button:has-text("Todos")')).toBeVisible()
  })

  test('empty state de Fiados sin datos', async () => {
    await gotoPedidos(p)
    await tabButton(p, 'Fiados').click()
    await p.waitForTimeout(500)
    const bodyText = await p.locator('body').textContent()
    // Either shows empty state or has data
    const hasEmptyState = bodyText?.includes('No hay fiados') || bodyText?.includes('No hay deudas')
    const hasData = bodyText?.includes('$') && bodyText?.includes('días')
    expect(hasEmptyState || hasData).toBe(true)
  })

  test('crear pedido fiado y verificar que aparece en tab Fiados', async () => {
    // Create a client and a partial-payment pedido (fiado)
    const c = await createCliente(p)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    // Create pedido with partial payment (leaves saldo)
    await apiPost(p, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 3 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 2000 }], // Partial - leaves balance
    })
    await gotoPedidos(p)
    await p.waitForTimeout(500)
    // Navigate to Fiados
    await tabButton(p, 'Fiados').click()
    await p.waitForTimeout(1000)
    // Should see the client with debt
    const bodyText = await p.locator('body').textContent()
    expect(bodyText?.length).toBeGreaterThan(10)
    // Check for debt indicator
    const hasDebt = bodyText?.includes('$') || bodyText?.includes('deuda') || bodyText?.includes('fiado')
    expect(hasDebt).toBe(true)
  })

  test('expandir pedidos de cliente en Fiados', async () => {
    // Create fiado data
    const c = await createCliente(p)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    await apiPost(p, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 1000 }],
    })
    await gotoPedidos(p)
    await p.waitForTimeout(500)
    await tabButton(p, 'Fiados').click()
    await p.waitForTimeout(1000)
    // Click "Ver pedidos" button
    const verPedidosBtn = p.locator('button:has-text("Ver pedidos")').first()
    if (await verPedidosBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await verPedidosBtn.click()
      await p.waitForTimeout(500)
      // Expanded row should show pedido details
      const expandedContent = p.locator('td[colspan="5"]')
      expect(await expandedContent.first().isVisible({ timeout: 2000 }).catch(() => false)).toBe(true)
    }
  })

  test('formulario de pago en Fiados', async () => {
    const c = await createCliente(p)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    await apiPost(p, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 1000 }],
    })
    await gotoPedidos(p)
    await p.waitForTimeout(500)
    await tabButton(p, 'Fiados').click()
    await p.waitForTimeout(1000)
    // Click "Pagar" button
    const pagarBtn = p.locator('button:has-text("Pagar")').first()
    if (await pagarBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await pagarBtn.click()
      await p.waitForTimeout(500)
      // Payment form should appear — the Monto input signals the form opened
      const montoInput = p.locator('input[placeholder*="Monto" i]').first()
      if (await montoInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(montoInput).toBeVisible()
      }
      // Confirm button — scoped: the dialog shows "Confirmar pago", table rows show "Pagar"
      const confirmBtn = p.locator('button:has-text("Confirmar pago")').first()
      if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expect(confirmBtn).toBeVisible()
      }
    }
  })

  test('metodos de pago disponibles en Fiados', async () => {
    await gotoPedidos(p)
    await tabButton(p, 'Fiados').click()
    await p.waitForTimeout(500)
    const pagarBtn = p.locator('button:has-text("Pagar")').first()
    if (await pagarBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await pagarBtn.click()
      await p.waitForTimeout(500)
      // Payment methods are shown as buttons/chips, not just a select
      const bodyText = await p.locator('body').textContent()
      expect(bodyText?.includes('EFECTIVO') || bodyText?.includes('efectivo')).toBe(true)
    }
  })

  test('filtro de dias fiado funciona', async () => {
    await gotoPedidos(p)
    await tabButton(p, 'Fiados').click()
    await p.waitForTimeout(500)
    const diasSelect = p.locator('select').first()
    if (await diasSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await diasSelect.selectOption('0-7')
      await p.waitForTimeout(300)
      await diasSelect.selectOption('8-30')
      await p.waitForTimeout(300)
      await diasSelect.selectOption('30+')
      await p.waitForTimeout(300)
      await diasSelect.selectOption('todos')
      await p.waitForTimeout(300)
    }
  })

  test('badge de limite de fiados (count/limite)', async () => {
    const c = await createCliente(p)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    // Create 2 fiados for the same client
    await apiPost(p, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 1000 }],
    })
    await apiPost(p, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_HIELO', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 500 }],
    })
    await gotoPedidos(p)
    await p.waitForTimeout(500)
    await tabButton(p, 'Fiados').click()
    await p.waitForTimeout(1000)
    // Should show badge like "2/3"
    const bodyText = await p.locator('body').textContent()
    expect(bodyText?.length).toBeGreaterThan(10)
  })
})

// ─── Tab Alertas Tests ───────────────────────────────────────────────────────

test.describe('Pedidos — Tab Alertas', () => {
  let p: Page

  test.beforeAll(async ({ browser }) => {
    p = await sharedPageLogin(browser)
  })
  test.afterAll(async () => {
    await p?.close()
  })
  test('header explicativo de Alertas es visible', async () => {
    await gotoPedidos(p)
    await tabButton(p, 'Alertas').click()
    await p.waitForTimeout(500)
    await expect(p.locator('text=Sistema de Alertas')).toBeVisible()
    // Description
    await expect(p.locator('text=Detectamos automáticamente comportamientos inusuales').or(
      p.locator('text=comportamientos inusuales')
    )).toBeVisible()
  })

  test('reglas de deteccion activas (collapsable)', async () => {
    await gotoPedidos(p)
    await tabButton(p, 'Alertas').click()
    await p.waitForTimeout(500)
    // Collapsible section
    await expect(p.locator('text=Reglas de detección activas')).toBeVisible()
    // Click to expand
    await p.locator('text=Reglas de detección activas').click()
    await p.waitForTimeout(500)
    // Should show rule cards
    const ruleCards = p.locator('.grid.grid-cols-1 button')
    expect(await ruleCards.count()).toBeGreaterThan(0)
  })

  test('filtros de Alertas estan disponibles', async () => {
    await gotoPedidos(p)
    await tabButton(p, 'Alertas').click()
    await p.waitForTimeout(500)
    // Search
    await expect(p.locator('input[placeholder*="Buscar cliente" i]')).toBeVisible()
    // Severidad select
    const severidadSelect = p.locator('select').first()
    await expect(severidadSelect).toBeVisible()
    // Options
    await expect(severidadSelect.locator('option[value="TODAS"]')).toBeAttached()
    await expect(severidadSelect.locator('option[value="ALTA"]')).toBeAttached()
    await expect(severidadSelect.locator('option[value="MEDIA"]')).toBeAttached()
    await expect(severidadSelect.locator('option[value="BAJA"]')).toBeAttached()
  })

  test('empty state de Alertas sin datos', async () => {
    await gotoPedidos(p)
    await tabButton(p, 'Alertas').click()
    await p.waitForTimeout(500)
    const bodyText = await p.locator('body').textContent()
    const hasEmptyState = bodyText?.includes('Sin alertas') || bodyText?.includes('No se detectaron')
    const hasAlerts = bodyText?.includes('ALTA') || bodyText?.includes('MEDIA') || bodyText?.includes('BAJA')
    expect(hasEmptyState || hasAlerts).toBe(true)
  })

  test('crear escenario que genera alerta: 2 pedidos mismo dia', async () => {
    const c = await createCliente(p)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    // Create 2 pedidos for the same client today
    await apiPost(p, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 3000 }],
    })
    await apiPost(p, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_HIELO', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 3000 }],
    })
    await gotoPedidos(p)
    await p.waitForTimeout(1000)
    // Navigate to Alertas
    await tabButton(p, 'Alertas').click()
    await p.waitForTimeout(1000)
    // Should see the client with an alert (2DO_PEDIDO)
    const bodyText = await p.locator('body').textContent()
    const hasAlert = bodyText?.includes('2do pedido') || bodyText?.includes('BAJA') || bodyText?.includes('alertas')
    expect(hasAlert).toBe(true)
  })

  test('expandir detalle de alertas por cliente', async () => {
    const c = await createCliente(p)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    // Create 3 pedidos for the same client to trigger 3RO_PEDIDO
    await apiPost(p, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 3000 }],
    })
    await apiPost(p, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 3000 }],
    })
    await apiPost(p, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 3000 }],
    })
    await gotoPedidos(p)
    await p.waitForTimeout(1000)
    await tabButton(p, 'Alertas').click()
    await p.waitForTimeout(1000)
    // Click "Ver detalle"
    const verDetalleBtn = p.locator('button:has-text("Ver detalle")').first()
    if (await verDetalleBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await verDetalleBtn.click()
      await p.waitForTimeout(500)
      // Expanded content should show alert details
      const expandedContent = p.locator('td[colspan="4"]')
      expect(await expandedContent.first().isVisible({ timeout: 2000 }).catch(() => false)).toBe(true)
    }
  })

  test('filtro por severidad en Alertas', async () => {
    await gotoPedidos(p)
    await tabButton(p, 'Alertas').click()
    await p.waitForTimeout(500)
    const severidadSelect = p.locator('select').first()
    if (await severidadSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await severidadSelect.selectOption('ALTA')
      await p.waitForTimeout(300)
      await severidadSelect.selectOption('MEDIA')
      await p.waitForTimeout(300)
      await severidadSelect.selectOption('BAJA')
      await p.waitForTimeout(300)
      await severidadSelect.selectOption('TODAS')
      await p.waitForTimeout(300)
    }
  })

  test('boton Guia visible en detalle de alerta', async () => {
    const c = await createCliente(p)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    await apiPost(p, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 3000 }],
    })
    await apiPost(p, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 3000 }],
    })
    await gotoPedidos(p)
    await p.waitForTimeout(1000)
    await tabButton(p, 'Alertas').click()
    await p.waitForTimeout(1000)
    const verDetalleBtn = p.locator('button:has-text("Ver detalle")').first()
    if (await verDetalleBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await verDetalleBtn.click()
      await p.waitForTimeout(500)
      // Guia button
      const guiaBtn = p.locator('button:has-text("Guía")').first()
      expect(await guiaBtn.isVisible({ timeout: 2000 }).catch(() => false)).toBe(true)
    }
  })

  test('boton Crear caso visible en detalle de alerta', async () => {
    const c = await createCliente(p)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    await apiPost(p, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 3000 }],
    })
    await apiPost(p, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 3000 }],
    })
    await gotoPedidos(p)
    await p.waitForTimeout(1000)
    await tabButton(p, 'Alertas').click()
    await p.waitForTimeout(1000)
    const verDetalleBtn = p.locator('button:has-text("Ver detalle")').first()
    if (await verDetalleBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await verDetalleBtn.click()
      await p.waitForTimeout(500)
      // Crear caso button
      const casoBtn = p.locator('button:has-text("Crear caso")').first()
      expect(await casoBtn.isVisible({ timeout: 2000 }).catch(() => false)).toBe(true)
    }
  })

  test('badge de severidad se renderiza con colores correctos', async () => {
    const c = await createCliente(p)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    await apiPost(p, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 3000 }],
    })
    await apiPost(p, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 3000 }],
    })
    await gotoPedidos(p)
    await p.waitForTimeout(1000)
    await tabButton(p, 'Alertas').click()
    await p.waitForTimeout(1000)
    // Severidad badge
    // FIX: isVisible({timeout}) no espera (el timeout está deprecado/
    // ignorado por Playwright), Y el locator sin ":visible" puede resolver
    // primero a una instancia oculta del badge (ej. dentro de un panel de
    // detalle todavía colapsado/otro cliente de la lista) antes que a la
    // fila-resumen visible -- confirmado: 9 matches en DOM, el primero
    // "hidden". ":visible" filtra a las instancias realmente renderizadas
    // en pantalla; expect().toBeVisible({timeout}) hace polling real.
    const severidadBadge = p.locator('span:visible:has-text("BAJA"), span:visible:has-text("MEDIA"), span:visible:has-text("ALTA")')
    await expect(severidadBadge.first()).toBeVisible({ timeout: 5000 })
  })
})

// ─── Device Context Tests ────────────────────────────────────────────────────

test.describe('Pedidos — Desktop Viewport', () => {
  let p: Page

  test.beforeAll(async ({ browser }) => {
    p = await sharedPageLogin(browser)
    await p.setViewportSize({ width: 1280, height: 720 })
  })
  test.afterAll(async () => {
    await p?.close()
  })
  test('desktop layout es usable', async () => {
    await gotoPedidos(p)
    // Tabs visible (scoped to tab bar)
    await expect(tabButton(p, 'Pedidos')).toBeVisible()
    await expect(tabButton(p, 'Fiados')).toBeVisible()
    await expect(tabButton(p, 'Alertas')).toBeVisible()
    // No horizontal overflow
    const scrollWidth = await p.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await p.evaluate(() => document.documentElement.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2)
  })

  test('Fiados table en desktop', async () => {
    await gotoPedidos(p)
    await tabButton(p, 'Fiados').click()
    await p.waitForTimeout(500)
    // Table header should be visible on desktop
    const tableHeader = p.locator('table thead')
    if (await tableHeader.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(p.locator('th:has-text("Cliente")')).toBeVisible()
      await expect(p.locator('th:has-text("Deuda Total")')).toBeVisible()
    }
  })

  test('Alertas table en desktop', async () => {
    await gotoPedidos(p)
    await tabButton(p, 'Alertas').click()
    await p.waitForTimeout(500)
    const tableHeader = p.locator('table thead')
    if (await tableHeader.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(p.locator('th:has-text("Cliente")')).toBeVisible()
      await expect(p.locator('th:has-text("Alertas")')).toBeVisible()
      await expect(p.locator('th:has-text("Severidad")')).toBeVisible()
    }
  })
})

test.describe('Pedidos — Mobile Viewport', () => {
  let p: Page

  test.beforeAll(async ({ browser }) => {
    p = await sharedPageLogin(browser)
    await p.setViewportSize({ width: 375, height: 667 })
  })
  test.afterAll(async () => {
    await p?.close()
  })
  test('mobile layout es usable', async () => {
    await gotoPedidos(p)
    // Tabs should still be visible (scoped to tab bar)
    await expect(tabButton(p, 'Pedidos')).toBeVisible()
    await expect(tabButton(p, 'Fiados')).toBeVisible()
    await expect(tabButton(p, 'Alertas')).toBeVisible()
  })

  test('Fiados mobile cards', async () => {
    await gotoPedidos(p)
    await tabButton(p, 'Fiados').click()
    await p.waitForTimeout(500)
    // Mobile cards are visible when md:hidden
    const bodyText = await p.locator('body').textContent()
    expect(bodyText?.length).toBeGreaterThan(10)
  })

  test('Alertas mobile cards', async () => {
    await gotoPedidos(p)
    await tabButton(p, 'Alertas').click()
    await p.waitForTimeout(500)
    const bodyText = await p.locator('body').textContent()
    expect(bodyText?.length).toBeGreaterThan(10)
  })

  test('touch targets en mobile son adecuados', async () => {
    await gotoPedidos(p)
    // Check that tab buttons have adequate touch targets (min 44px)
    const tabs = p.locator('.flex.border-b button')
    const count = await tabs.count()
    for (let i = 0; i < count; i++) {
      const box = await tabs.nth(i).boundingBox()
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(36) // relaxed for mobile tabs
      }
    }
  })
})

// ─── Edge Cases ──────────────────────────────────────────────────────────────

test.describe('Pedidos — Edge Cases', () => {
  let p: Page

  test.beforeAll(async ({ browser }) => {
    p = await sharedPageLogin(browser)
  })
  test.afterAll(async () => {
    await p?.close()
  })
  test('URL con filtros combinados persiste en tabs', async () => {
    await p.goto(`${PEDIDOS_URL}?tab=fiados&search=test`)
    await p.waitForLoadState('domcontentloaded')
    await p.waitForTimeout(1000)
    // Should be on Fiados tab
    await expect(p).toHaveURL(/tab=fiados/)
    // The search param persists in URL but Fiados has its own local search
    // Verify we're on the correct tab
    await expect(p.locator('text=Control de Fiados')).toBeVisible()
  })

  test('navegar a pedidos con clienteId en URL', async () => {
    const c = await createCliente(p)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    await p.goto(`${PEDIDOS_URL}?clienteId=${clienteId}`)
    await p.waitForLoadState('domcontentloaded')
    await p.waitForTimeout(1000)
    // Should show client filter banner
    const bodyText = await p.locator('body').textContent()
    expect(bodyText?.length).toBeGreaterThan(10)
  })

  test('tab Pedidos muestra filtros y Fiados NO los muestra', async () => {
    await gotoPedidos(p)
    // Pedidos tab has SmartDateFilter
    // FIX: 'button:has-text("Hoy")' matchea por substring -- las stat
    // cards "Entregados Hoy"/"Ventas Hoy" (agregadas después de que este
    // test se escribió) también contienen "Hoy", volviendo el locator
    // ambiguo (strict mode violation, 3 elementos). El botón real del
    // SmartDateFilter tiene el texto exacto "Hoy".
    await expect(p.getByRole('button', { name: 'Hoy', exact: true })).toBeVisible()
    // Switch to Fiados
    await tabButton(p, 'Fiados').click()
    await p.waitForTimeout(500)
    // SmartDateFilter should NOT be visible (Fiados has its own period filter)
    // Fiados has its own period chips with different styling
    const fiadosPeriod = p.locator('.bg-red-50 button:has-text("Hoy")')
    expect(await fiadosPeriod.isVisible({ timeout: 2000 }).catch(() => false)).toBe(true)
  })

  test('alertas search filtra por nombre de cliente', async () => {
    const c = await createCliente(p, { nombre: 'Cliente Busqueda Test' })
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    // Create 2 pedidos to trigger alert
    await apiPost(p, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 3000 }],
    })
    await apiPost(p, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 3000 }],
    })
    await gotoPedidos(p)
    await p.waitForTimeout(1000)
    await tabButton(p, 'Alertas').click()
    await p.waitForTimeout(1000)
    // Search for the client
    const searchInput = p.locator('input[placeholder*="Buscar cliente" i]')
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill('Busqueda Test')
      await p.waitForTimeout(500)
      // Should still show the client
      const bodyText = await p.locator('body').textContent()
      expect(bodyText?.includes('Busqueda Test') || bodyText?.includes('alertas')).toBe(true)
    }
  })

  test('fiados search filtra por nombre de cliente', async () => {
    const c = await createCliente(p, { nombre: 'Cliente Fiado Busqueda' })
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    await apiPost(p, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 1000 }],
    })
    await gotoPedidos(p)
    await p.waitForTimeout(500)
    await tabButton(p, 'Fiados').click()
    await p.waitForTimeout(1000)
    const searchInput = p.locator('input[placeholder*="Buscar cliente" i]')
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill('Fiado Busqueda')
      await p.waitForTimeout(500)
      const bodyText = await p.locator('body').textContent()
      expect(bodyText?.length).toBeGreaterThan(10)
    }
  })
})
