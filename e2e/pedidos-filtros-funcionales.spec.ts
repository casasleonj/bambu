import { test, expect, loginAs, apiPost, apiGet, createCliente, createClienteFull, goto, resetDatabase, responsiveContainer } from './fixtures'
import { execSync } from 'child_process'
import { resolve } from 'path'

const root = resolve(__dirname, '..')

function getYesterdayStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

function getTodayStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

function createPedidoDirecto(clienteId: string, fechaStr: string, estadoEntrega = 'ENTREGADO', estadoPago = 'PENDIENTE'): string {
  const output = execSync(
    `npx tsx prisma/create-pedido-fiado.ts ${clienteId} ${fechaStr} ${estadoEntrega} ${estadoPago}`,
    { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
  )
  return output.trim()
}

test.describe('Pedidos: filtros backend funcionan', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeAll(() => {
    resetDatabase()
  })

  test('filtro tipo=ENVIO solo devuelve pedidos DOMICILIO', async ({ page }) => {
    await loginAs(page, 'admin')
    const c = await createCliente(page)

    await apiPost(page, '/api/pedidos', {
      clienteId: c.cliente.id,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
    })

    await apiPost(page, '/api/pedidos', {
      clienteId: c.cliente.id,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })

    const res = await apiGet(page, '/api/pedidos?all=true&tipo=ENVIO')
    const body = await res.json()
    expect(body.pedidos.length).toBeGreaterThanOrEqual(1)
    expect(body.pedidos.every((p: { tipo: string }) => p.tipo === 'ENVIO')).toBe(true)
  })

  test('filtro estadoEntrega=PENDIENTE funciona', async ({ page }) => {
    await loginAs(page, 'admin')
    const res = await apiGet(page, '/api/pedidos?all=true&estadoEntrega=PENDIENTE')
    const body = await res.json()
    expect(body.pedidos.every((p: { estadoEntrega: string }) => p.estadoEntrega === 'PENDIENTE')).toBe(true)
  })

  test('filtro estadoPago=PENDIENTE funciona', async ({ page }) => {
    await loginAs(page, 'admin')
    const res = await apiGet(page, '/api/pedidos?all=true&estadoPago=PENDIENTE')
    const body = await res.json()
    expect(body.pedidos.every((p: { estadoPago: string }) => p.estadoPago === 'PENDIENTE')).toBe(true)
  })

  test('filtro origen=PEDIDO funciona', async ({ page }) => {
    await loginAs(page, 'admin')
    const res = await apiGet(page, '/api/pedidos?all=true&origen=PEDIDO')
    const body = await res.json()
    expect(body.pedidos.every((p: { origen: string }) => p.origen === 'PEDIDO')).toBe(true)
  })

  test('filtro multi-valor estadoEntrega=PENDIENTE&ENTREGADO devuelve ambos', async ({ page }) => {
    await loginAs(page, 'admin')
    const c = await createCliente(page)
    const today = getTodayStr()

    createPedidoDirecto(c.cliente.id, today, 'PENDIENTE', 'PENDIENTE')
    createPedidoDirecto(c.cliente.id, today, 'ENTREGADO', 'PENDIENTE')

    const res = await apiGet(page, '/api/pedidos?all=true&estadoEntrega=PENDIENTE&estadoEntrega=ENTREGADO')
    const body = await res.json()
    const estados = body.pedidos.map((p: { estadoEntrega: string }) => p.estadoEntrega)
    expect(estados).toContain('PENDIENTE')
    expect(estados).toContain('ENTREGADO')
  })
})

test.describe('Pedidos: UX filtros y limpieza', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeAll(() => {
    resetDatabase()
  })

  test('Limpiar todo borra buscador y filtros activos', async ({ page }) => {
    await loginAs(page, 'admin')

    // Navegar a /pedidos con búsqueda y filtro activo
    await goto(page, '/pedidos?estadoEntrega=PENDIENTE&search=Pedro')

    const searchInput = page.locator('input[placeholder*="Buscar por cliente"]').first()

    // Verificar que hay filtros activos
    await expect(page.locator('[aria-label="Quitar filtro Entrega PENDIENTE"]')).toBeVisible()
    await expect(searchInput).toHaveValue('Pedro')

    // Click en Limpiar todo
    await page.locator('button:has-text("Limpiar todo")').first().click()

    // Verificar que todo se limpió
    await expect(page).toHaveURL(/all=true/)
    await expect(searchInput).toHaveValue('')
    await expect(page.locator('[aria-label="Quitar filtro Entrega PENDIENTE"]')).not.toBeVisible()
  })

  // Regresión: bug reportado por usuarios en producción — al clickear "Limpiar
  // todo", la lista completa de pedidos no aparecía en la UI, solo tras F5.
  // Causa raíz: pedidos-client usaba window.history.replaceState() reconstruyendo
  // la URL desde un snapshot de useSearchParams() potencialmente stale. Cuando
  // el usuario clickeaba un chip de filtro justo después de montar la página,
  // ese snapshot stale no incluía el desde/hasta que SmartDateFilter (un
  // escritor de URL independiente, vía useShallowSearchParams) acababa de
  // escribir — el segundo escritor (pedidos-client) lo pisaba en silencio. El
  // test anterior solo verificaba el estado de los chips/input, no el
  // contenido real de la tabla — por eso el bug no se detectó antes.
  test('Limpiar todo muestra la lista completa en la UI sin necesitar refresh (regresión race de URL)', async ({ page }) => {
    await loginAs(page, 'admin')
    const c = await createCliente(page)

    // Pedido de hace 10 días: fuera del rango "hoy" por defecto, solo debe
    // aparecer cuando el filtro realmente se limpia (all=true efectivo).
    const fechaVieja = new Date()
    fechaVieja.setDate(fechaVieja.getDate() - 10)
    const fechaViejaStr = fechaVieja.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    createPedidoDirecto(c.cliente.id, fechaViejaStr, 'PENDIENTE', 'PENDIENTE')

    // Landing SIN filtros (como un usuario real) — SmartDateFilter escribe su
    // desde/hasta default ("hoy") vía su propio shallow-routing al montar.
    await goto(page, '/pedidos')

    // Aplicar un filtro vía la UI real (no vía URL directa) inmediatamente
    // después del mount, para no darle tiempo a que las escrituras de URL de
    // ambos componentes se "asienten" — esta es la ventana de carrera real.
    await page.locator('button:has-text("Filtros")').first().click()
    // Mobile usa <details> colapsables por categoría (pedido-filters.tsx);
    // el chip "PENDIENTE" del grupo "Entrega" solo es visible/clickeable tras
    // expandir su <summary>. En desktop este locator no matchea nada visible
    // (el grid ya está expandido), así que el guard no hace nada allí.
    const entregaSummary = page.locator('summary:has-text("Entrega")').first()
    if (await entregaSummary.isVisible().catch(() => false)) {
      await entregaSummary.click()
    }
    // `:visible` evita pisar la instancia desktop (oculta con `hidden md:grid`
    // en mobile) — mismo anti-patrón documentado en AGENTS.md #24.
    await page.locator('button:visible:text-is("PENDIENTE")').first().click()

    const limpiarBtn = page.locator('button:has-text("Limpiar todo")').first()
    await limpiarBtn.waitFor({ state: 'visible', timeout: 10_000 })
    await limpiarBtn.click()

    // Debe aparecer en la lista SIN reload — sin esto, el bug de producción
    // pasaba silenciosamente porque el test viejo no miraba la tabla.
    const view = responsiveContainer(page, 'pedidos-mobile', 'pedidos-desktop')
    await expect(view.getByText(c.cliente.nombre)).toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/all=true/)
  })
})

test.describe('Pedidos: tabs independientes y badges', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: { cookies: [], origins: [] } })
  test.setTimeout(60000)

  test.beforeAll(() => {
    resetDatabase()
  })

  test('badge de Fiados refleja clientes con deuda y no cambia con filtros de Pedidos', async ({ page }) => {
    await loginAs(page, 'admin')

    // Cliente con límite de fiados = 5 y 2 pedidos fiados.
    const c = await createClienteFull(page, {
      nombre: 'Cliente Badge Fiados',
      telefono: '3001112222',
      limitePedidosFiados: 5,
    })
    const today = getTodayStr()
    createPedidoDirecto(c.cliente.id, today, 'ENTREGADO', 'PENDIENTE')
    createPedidoDirecto(c.cliente.id, today, 'ENTREGADO', 'PENDIENTE')

    await goto(page, '/pedidos')

    // El badge de Fiados debe mostrar 1 (un cliente con fiados).
    const fiadosTab = page.locator('[data-testid="tab-fiados"]')
    await expect(fiadosTab.locator('span.rounded-full')).toHaveText('1', { timeout: 10000 })

    // Ir a Fiados y verificar X/Y = 2/5.
    await fiadosTab.click()
    const fiadosView = responsiveContainer(page, 'fiados-mobile', 'fiados-desktop')
    await expect(fiadosView.getByText('Cliente Badge Fiados')).toBeVisible({ timeout: 10000 })
    await expect(fiadosView.getByText('2/5')).toBeVisible()

    // Volver a Pedidos y aplicar un filtro que excluya al cliente.
    await page.locator('[data-testid="tab-hoy"]').click()
    await page.locator('input[placeholder*="Buscar por cliente"]').first().fill('ZZZ_NO_MATCH')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/search=ZZZ_NO_MATCH/, { timeout: 10000 })
    // El tab "Hoy" trae desde/hasta=hoy por default (SmartDateFilter), asi que
    // el empty-state prioriza el mensaje de rango de fechas sobre el generico
    // de "sin resultados" (mismo criterio que pedido-table.tsx: hasDateFilter
    // antes que hasActiveFilters).
    await expect(responsiveContainer(page, 'pedidos-mobile', 'pedidos-desktop').getByText('No hay pedidos en este rango de fechas')).toBeVisible({ timeout: 10000 })

    // Volver a Fiados: el badge y el X/Y deben seguir igual.
    await fiadosTab.click()
    await expect(fiadosTab.locator('span.rounded-full')).toHaveText('1')
    await expect(fiadosView.getByText('2/5')).toBeVisible()
  })

  test('filtros de Pedidos no afectan el dataset de Fiados', async ({ page }) => {
    await loginAs(page, 'admin')

    const c = await createCliente(page, {
      nombre: 'Cliente Filtro Independiente',
      telefono: '3003334444',
    })
    const today = getTodayStr()
    // Pedido ENTREGADO PENDIENTE (aparece en fiados).
    createPedidoDirecto(c.cliente.id, today, 'ENTREGADO', 'PENDIENTE')

    await goto(page, '/pedidos?estadoEntrega=PENDIENTE')
    // Mismo criterio que el test anterior: sin desde/hasta explicitos, el tab
    // "Hoy" default a hoy y el empty-state usa el mensaje de rango de fechas.
    await expect(responsiveContainer(page, 'pedidos-mobile', 'pedidos-desktop').getByText('No hay pedidos en este rango de fechas')).toBeVisible({ timeout: 10000 })

    // Cambiar a Fiados: el pedido ENTREGADO PENDIENTE debe seguir visible.
    await page.locator('[data-testid="tab-fiados"]').click()
    await expect(responsiveContainer(page, 'fiados-mobile', 'fiados-desktop').getByText('Cliente Filtro Independiente')).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Pedidos: tab Fiados', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeAll(() => {
    resetDatabase()
  })

  test('tab Fiados muestra fiados de fechas pasadas sin filtrar por turno', async ({ page }) => {
    await loginAs(page, 'admin')
    const c = await createCliente(page, { nombre: 'Pedro Pinilla', telefono: '3001234567' })
    const yesterday = getYesterdayStr()
    createPedidoDirecto(c.cliente.id, yesterday, 'ENTREGADO', 'PENDIENTE')

    // Ir a /pedidos (sin ?all=true, el default es turno)
    await goto(page, '/pedidos?tab=fiados')

    // Pedro debe aparecer aunque su fiado sea de ayer
    await expect(responsiveContainer(page, 'fiados-mobile', 'fiados-desktop').getByText('Pedro Pinilla')).toBeVisible({ timeout: 10000 })
  })

  test('tab Fiados con periodo Hoy oculta fiados de ayer y muestra hint', async ({ page }) => {
    await loginAs(page, 'admin')
    const c = await createCliente(page, { nombre: 'Sandra Leon', telefono: '3007654321' })
    const yesterday = getYesterdayStr()
    createPedidoDirecto(c.cliente.id, yesterday, 'ENTREGADO', 'PENDIENTE')

    await goto(page, '/pedidos?tab=fiados')

    // Click en Hoy
    await page.locator('button:has-text("Hoy")').first().click()

    // Sandra no debe aparecer (fiado de ayer)
    await expect(responsiveContainer(page, 'fiados-mobile', 'fiados-desktop').getByText('Sandra Leon')).not.toBeVisible({ timeout: 5000 })

    // El hint debe ser visible
    await expect(page.locator('text=Mostrando solo fiados de hoy').first()).toBeVisible()
  })

  test('boton Limpiar en FiadosTable resetea filtros locales', async ({ page }) => {
    await loginAs(page, 'admin')
    const c = await createCliente(page, { nombre: 'Cliente Limpieza', telefono: '3009998888' })
    const today = getTodayStr()
    createPedidoDirecto(c.cliente.id, today, 'ENTREGADO', 'PENDIENTE')

    await goto(page, '/pedidos?tab=fiados')
    const fiadosView = responsiveContainer(page, 'fiados-mobile', 'fiados-desktop')
    await expect(fiadosView.getByText('Cliente Limpieza')).toBeVisible({ timeout: 10000 })

    // Aplicar filtros locales
    await page.locator('input[placeholder="Buscar cliente..."]').first().fill('XYZ')
    await page.locator('input[placeholder="Deuda min"]').first().fill('999999')

    // Cliente debe desaparecer
    await expect(fiadosView.getByText('Cliente Limpieza')).not.toBeVisible({ timeout: 5000 })

    // Click en Limpiar
    await page.locator('button:has-text("Limpiar")').first().click()

    // Cliente debe volver a aparecer
    await expect(fiadosView.getByText('Cliente Limpieza')).toBeVisible({ timeout: 10000 })
  })
})
