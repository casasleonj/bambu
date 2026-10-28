// @tests #515: adversariales de desconexión, consulta completa y enlaces.
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { test, expect, loginAs, goto, appMain, resetTestDatabase, apiPost } from './fixtures'
import type { Page } from '@playwright/test'

const db = new PrismaClient()
test.describe.configure({ mode: 'default' })
test.beforeEach(() => resetTestDatabase())
test.afterAll(async () => db.$disconnect())

async function escenario() {
  const cliente = await db.cliente.create({ data: { nombre: `Consulta 515 ${randomUUID().slice(0, 6)}`, telefono: randomUUID() } })
  const rows = []
  for (const [dias, total, estado] of [[12, 40000, 'PENDIENTE'], [8, 20000, 'ENTREGADO'], [0, 10000, 'ENTREGADO']] as const) {
    const pedido = await db.pedido.create({ data: { clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
      estado, estadoEntrega: estado, estadoPago: 'PENDIENTE', total, totalPagado: 0, saldo: total,
      fecha: new Date(Date.now() - dias * 86400000),
      items: { create: [{ producto: 'PACA_AGUA', cantPedido: 4, cantEntrega: estado === 'ENTREGADO' ? 4 : 0, precio: total / 4, subtotal: total }] } } })
    const factura = await db.factura.create({ data: { pedidoId: pedido.id, clienteId: cliente.id,
      numero: `F515-${randomUUID().slice(0, 6)}`, subtotal: total, total, montoPagado: 0, saldo: total, fecha: pedido.fecha } })
    rows.push({ pedido, factura })
  }
  return { cliente, pendiente: rows[0], viejo: rows[1], hoy: rows[2] }
}
async function abrirFiados(page: Page, nombre: string) {
  await goto(page, '/pedidos?tab=fiados')
  await appMain(page).getByLabel('Buscar cliente', { exact: true }).fill(nombre)
  await expect(appMain(page).getByText(nombre, { exact: true }).locator('visible=true').first()).toBeVisible()
}
const pagoDialog = (page: Page) => page.getByTestId('cobro-fiado-dialog')
async function llenarCobro(page: Page, monto = '10000') {
  await appMain(page).getByRole('button', { name: 'Registrar pago', exact: true }).locator('visible=true').click()
  await expect(pagoDialog(page).getByTestId('deuda-cliente-preparada')).toBeVisible()
  await pagoDialog(page).getByLabel('Medio 1', { exact: true }).selectOption('EFECTIVO')
  await pagoDialog(page).getByLabel('Monto 1', { exact: true }).fill(monto)
  const oficina = pagoDialog(page).getByTestId('cobro-recibio-oficina')
  if (await oficina.count()) await oficina.check()
}
async function cola(page: Page, table: 'requestQueue' | 'failedItems') {
  return page.evaluate(async name => {
    const request = indexedDB.open('BambuOfflineDB')
    return new Promise<number>((resolve, reject) => {
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(name)) { database.close(); resolve(0); return }
        const tx = database.transaction(name, 'readonly'), count = tx.objectStore(name).count()
        count.onsuccess = () => { const n = count.result; database.close(); resolve(n) }
        count.onerror = () => reject(count.error)
      }
    })
  }, table)
}

test('offline con deuda cambiada pasa a revisión: no anuncia pago ni descarta la referencia', async ({ page, context }) => {
  test.setTimeout(90000)
  const { cliente } = await escenario()
  await loginAs(page, 'admin'); await abrirFiados(page, cliente.nombre); await llenarCobro(page)
  // La fixture desactiva el sync automático; habilitamos el comportamiento real.
  await page.evaluate(() => { window.__PLAYWRIGHT_TEST__ = false })
  await context.setOffline(true)
  await pagoDialog(page).getByRole('button', { name: 'Revisar reparto', exact: true }).click()
  await pagoDialog(page).getByRole('button', { name: /Registrar.*10/ }).click()
  await expect(pagoDialog(page).getByRole('heading', { name: 'Pago guardado en este dispositivo', exact: true })).toBeVisible()
  expect(await cola(page, 'requestQueue')).toBe(1)
  expect((await apiPost(page, '/api/pedidos/pagar-fiado', { clienteId: cliente.id, monto: 1000, metodo: 'EFECTIVO', offlineId: randomUUID() })).status()).toBe(200)
  await context.setOffline(false)
  await expect(pagoDialog(page).getByRole('button', { name: 'Actualizar reparto', exact: true })).toBeVisible({ timeout: 30000 })
  expect(await cola(page, 'failedItems')).toBe(1)
  expect(await cola(page, 'requestQueue')).toBe(0)
  expect(await db.pago.count({ where: { pedido: { clienteId: cliente.id } } })).toBe(1)
  await expect(pagoDialog(page).getByRole('heading', { name: 'Pago registrado', exact: true })).toHaveCount(0)
  await pagoDialog(page).getByRole('button', { name: 'Actualizar reparto', exact: true }).click()
  await pagoDialog(page).getByRole('button', { name: /Registrar.*10/ }).click()
  await expect(pagoDialog(page).getByRole('heading', { name: 'Pago registrado', exact: true })).toBeVisible()
  expect(await cola(page, 'failedItems')).toBe(0)
  expect(await db.pago.count({ where: { pedido: { clienteId: cliente.id } } })).toBe(2)
})

test('sin una consulta previa verificable, guarda borrador y no inventa reparto ni cobro offline', async ({ page, context }) => {
  test.setTimeout(90000)
  const { cliente } = await escenario()
  await loginAs(page, 'admin'); await abrirFiados(page, cliente.nombre)
  await page.route('**/api/pedidos/pagar-fiado?clienteId=*', route => route.abort())
  await appMain(page).getByRole('button', { name: 'Registrar pago', exact: true }).locator('visible=true').click()
  await pagoDialog(page).getByLabel('Medio 1', { exact: true }).selectOption('EFECTIVO')
  await pagoDialog(page).getByLabel('Monto 1', { exact: true }).fill('10000')
  if (await pagoDialog(page).getByTestId('cobro-recibio-oficina').count()) await pagoDialog(page).getByTestId('cobro-recibio-oficina').check()
  // La fixture desactiva el sync automático; habilitamos el comportamiento real.
  await page.evaluate(() => { window.__PLAYWRIGHT_TEST__ = false })
  await context.setOffline(true)
  await pagoDialog(page).getByRole('button', { name: 'Revisar reparto', exact: true }).click()
  await expect(pagoDialog(page)).toContainText('El borrador está guardado; necesitas conexión')
  await expect(pagoDialog(page).getByRole('button', { name: /Registrar.*10/ })).toHaveCount(0)
  expect(await cola(page, 'requestQueue')).toBe(0)
  expect(await db.pago.count({ where: { pedido: { clienteId: cliente.id } } })).toBe(0)
  await context.setOffline(false)
})

test('respuesta perdida tras registrar: reintenta con la misma referencia y conserva un solo pago', async ({ page }) => {
  test.setTimeout(90000)
  const { cliente } = await escenario()
  await loginAs(page, 'admin'); await abrirFiados(page, cliente.nombre); await llenarCobro(page)
  await pagoDialog(page).getByRole('button', { name: 'Revisar reparto', exact: true }).click()
  let referencia = ''
  await page.route('**/api/pedidos/pagar-fiado', async route => {
    if (route.request().method() !== 'POST') return route.continue()
    referencia = route.request().postDataJSON().offlineId
    const response = await route.fetch()
    expect(response.status()).toBe(200)
    await route.abort('connectionreset')
  }, { times: 1 })
  await pagoDialog(page).getByRole('button', { name: /Registrar.*10/ }).click()
  await expect(pagoDialog(page).getByRole('button', { name: 'Reintentar con la misma referencia', exact: true })).toBeVisible()
  expect(await db.pago.count({ where: { offlineId: referencia } })).toBe(1)
  await pagoDialog(page).getByRole('button', { name: 'Reintentar con la misma referencia', exact: true }).click()
  await expect(pagoDialog(page).getByRole('heading', { name: 'Pago registrado', exact: true })).toBeVisible()
  expect(await db.pago.count({ where: { offlineId: referencia } })).toBe(1)
  expect(await cola(page, 'requestQueue')).toBe(0)
})

test('Todos consulta más de 200 pedidos, sin limitarse a la primera página', async ({ page }) => {
  test.setTimeout(90000)
  const { cliente } = await escenario()
  await db.pedido.createMany({ data: Array.from({ length: 201 }, () => ({ clienteId: cliente.id, canal: 'PUNTO' as const,
    origen: 'VENTA_RAPIDA' as const, estado: 'ENTREGADO' as const, estadoEntrega: 'ENTREGADO' as const,
    estadoPago: 'PENDIENTE' as const, total: 1000, saldo: 1000, totalPagado: 0 })) })
  const paginas: string[] = []
  page.on('response', r => { const u = new URL(r.url()); if (u.pathname === '/api/pedidos' && u.searchParams.get('scope') === 'fiados') paginas.push(u.searchParams.get('page') || '1') })
  await loginAs(page, 'admin'); await abrirFiados(page, cliente.nombre)
  const consulta = appMain(page).getByTestId(page.viewportSize()!.width < 768 ? 'fiados-mobile' : 'fiados-desktop')
  await expect(consulta).toContainText('203')
  await expect(consulta).toContainText(/231[.,]000/)
  expect(paginas).toContain('2')
})

test('fallo de consulta no se presenta como ausencia de deuda, y permite reintentar', async ({ page }) => {
  test.setTimeout(90000)
  const { cliente } = await escenario()
  await loginAs(page, 'admin')
  await page.route('**/api/pedidos?*', async route => {
    if (new URL(route.request().url()).searchParams.get('scope') !== 'fiados') return route.continue()
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: 'Fallo sintético de red' } }) })
  })
  await goto(page, '/pedidos?tab=fiados')
  await expect(appMain(page)).toContainText('No podemos confirmar si hay deudas.')
  await expect(appMain(page).getByText('No hay deuda pendiente de pedidos entregados', { exact: true })).toHaveCount(0)
  await page.unroute('**/api/pedidos?*')
  await appMain(page).getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(appMain(page).getByText(cliente.nombre, { exact: true }).locator('visible=true').first()).toBeVisible()
})

test('Alertas ignora Ayer, enlaza pedido y factura reales y conserva búsqueda y severidad', async ({ page }) => {
  test.setTimeout(90000)
  const { cliente, hoy } = await escenario()
  await db.pedido.update({ where: { id: hoy.pedido.id }, data: { estadoPago: 'VENCIDO' } })
  await loginAs(page, 'admin')
  const ayer = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  await goto(page, `/pedidos?desde=${ayer}&hasta=${ayer}`)
  await appMain(page).getByTestId('tab-alertas').click()
  await appMain(page).getByPlaceholder('Buscar cliente...', { exact: true }).fill(cliente.nombre)
  await appMain(page).locator('select').selectOption('ALTA')
  await appMain(page).getByRole('button', { name: 'Ver detalle', exact: true }).locator('visible=true').click()
  const pedido = appMain(page).getByRole('link', { name: `Ver pedido #${hoy.pedido.numero}`, exact: true }).locator('visible=true').first()
  await pedido.click()
  const detalle = page.getByRole('dialog', { name: `Pedido #${hoy.pedido.numero}`, exact: true })
  await detalle.getByRole('button', { name: 'Volver a Alertas', exact: true }).click()
  await appMain(page).getByRole('link', { name: `Ver factura ${hoy.factura.numero}`, exact: true }).locator('visible=true').first().click()
  await page.getByTestId('factura-consulta-modal').getByRole('button', { name: 'Volver a Alertas', exact: true }).click()
  await page.reload()
  await expect(appMain(page).getByPlaceholder('Buscar cliente...', { exact: true })).toHaveValue(cliente.nombre)
  await expect(appMain(page).locator('select')).toHaveValue('ALTA')
  await expect(pedido).toBeVisible()
})
