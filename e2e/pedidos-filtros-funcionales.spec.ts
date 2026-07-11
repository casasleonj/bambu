import { test, expect, fullLogin, apiPost, apiGet, createCliente, goto, resetDatabase } from './fixtures'
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
    await fullLogin(page)
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
    await fullLogin(page)
    const res = await apiGet(page, '/api/pedidos?all=true&estadoEntrega=PENDIENTE')
    const body = await res.json()
    expect(body.pedidos.every((p: { estadoEntrega: string }) => p.estadoEntrega === 'PENDIENTE')).toBe(true)
  })

  test('filtro estadoPago=PENDIENTE funciona', async ({ page }) => {
    await fullLogin(page)
    const res = await apiGet(page, '/api/pedidos?all=true&estadoPago=PENDIENTE')
    const body = await res.json()
    expect(body.pedidos.every((p: { estadoPago: string }) => p.estadoPago === 'PENDIENTE')).toBe(true)
  })

  test('filtro origen=PEDIDO funciona', async ({ page }) => {
    await fullLogin(page)
    const res = await apiGet(page, '/api/pedidos?all=true&origen=PEDIDO')
    const body = await res.json()
    expect(body.pedidos.every((p: { origen: string }) => p.origen === 'PEDIDO')).toBe(true)
  })

  test('filtro multi-valor estadoEntrega=PENDIENTE&ENTREGADO devuelve ambos', async ({ page }) => {
    await fullLogin(page)
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
    await fullLogin(page)

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
})

test.describe('Pedidos: tab Fiados', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeAll(() => {
    resetDatabase()
  })

  test('tab Fiados muestra fiados de fechas pasadas sin filtrar por turno', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page, { nombre: 'Pedro Pinilla', telefono: '3001234567' })
    const yesterday = getYesterdayStr()
    createPedidoDirecto(c.cliente.id, yesterday, 'ENTREGADO', 'PENDIENTE')

    // Ir a /pedidos (sin ?all=true, el default es turno)
    await goto(page, '/pedidos?tab=fiados')

    // Pedro debe aparecer aunque su fiado sea de ayer
    await expect(page.locator('text=Pedro Pinilla').first()).toBeVisible({ timeout: 10000 })
  })

  test('tab Fiados con periodo Hoy oculta fiados de ayer y muestra hint', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page, { nombre: 'Sandra Leon', telefono: '3007654321' })
    const yesterday = getYesterdayStr()
    createPedidoDirecto(c.cliente.id, yesterday, 'ENTREGADO', 'PENDIENTE')

    await goto(page, '/pedidos?tab=fiados')

    // Click en Hoy
    await page.locator('button:has-text("Hoy")').first().click()

    // Sandra no debe aparecer (fiado de ayer)
    await expect(page.locator('text=Sandra Leon').first()).not.toBeVisible({ timeout: 5000 })

    // El hint debe ser visible
    await expect(page.locator('text=Mostrando solo fiados de hoy').first()).toBeVisible()
  })

  test('boton Limpiar en FiadosTable resetea filtros locales', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page, { nombre: 'Cliente Limpieza', telefono: '3009998888' })
    const today = getTodayStr()
    createPedidoDirecto(c.cliente.id, today, 'ENTREGADO', 'PENDIENTE')

    await goto(page, '/pedidos?tab=fiados')
    await expect(page.locator('text=Cliente Limpieza').first()).toBeVisible({ timeout: 10000 })

    // Aplicar filtros locales
    await page.locator('input[placeholder="Buscar cliente..."]').first().fill('XYZ')
    await page.locator('input[placeholder="Deuda min"]').first().fill('999999')

    // Cliente debe desaparecer
    await expect(page.locator('text=Cliente Limpieza').first()).not.toBeVisible({ timeout: 5000 })

    // Click en Limpiar
    await page.locator('button:has-text("Limpiar")').first().click()

    // Cliente debe volver a aparecer
    await expect(page.locator('text=Cliente Limpieza').first()).toBeVisible({ timeout: 10000 })
  })
})
