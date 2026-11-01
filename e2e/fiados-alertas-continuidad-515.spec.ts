// @tests #515 #498 #517 — recorridos reales, incluida la transición Ayer → Fiados.
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
  const consulta = page.waitForResponse(r => r.ok() && new URL(r.url()).pathname === '/api/pedidos' && new URL(r.url()).searchParams.get('scope') === 'fiados')
  await goto(page, '/pedidos?tab=fiados')
  await consulta
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

test('Ayer en Pedidos no limita Todos en Fiados; documentos y regreso conservan contexto', async ({ page }, info) => {
  test.setTimeout(90000)
  const { cliente, viejo, hoy } = await escenario()
  await loginAs(page, 'admin')
  const ayer = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  await goto(page, `/pedidos?desde=${ayer}&hasta=${ayer}`)
  await appMain(page).getByTestId('tab-fiados').click()
  await expect(appMain(page).getByTestId('consulta-pedidos-hub')).toHaveCount(0)
  await expect(appMain(page).getByRole('button', { name: 'Todos', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await appMain(page).getByLabel('Buscar cliente', { exact: true }).fill(cliente.nombre)
  await expect(appMain(page).getByText(cliente.nombre, { exact: true }).locator('visible=true').first()).toBeVisible()
  await appMain(page).getByRole('button', { name: 'Ver pedidos', exact: true }).locator('visible=true').click()
  const oldLink = appMain(page).getByRole('link', { name: `Ver pedido #${viejo.pedido.numero}`, exact: true }).locator('visible=true')
  const todayLink = appMain(page).getByRole('link', { name: `Ver pedido #${hoy.pedido.numero}`, exact: true }).locator('visible=true')
  await expect(oldLink).toBeVisible(); await expect(todayLink).toBeVisible()
  await oldLink.click()
  const detalle = page.getByRole('dialog', { name: `Pedido #${viejo.pedido.numero}`, exact: true })
  await expect(detalle).toBeVisible(); await expect(detalle).toContainText(cliente.nombre)
  await detalle.getByRole('button', { name: 'Volver a Fiados', exact: true }).click()
  const res = page.waitForResponse(r => r.url().endsWith(`/api/facturas/${viejo.factura.id}`))
  await appMain(page).getByRole('link', { name: `Ver factura ${viejo.factura.numero}`, exact: true }).locator('visible=true').click()
  expect((await res).status()).toBe(200)
  const factura = page.getByTestId('factura-consulta-modal')
  await expect(factura).toContainText(viejo.factura.numero)
  await factura.getByRole('button', { name: 'Volver a Fiados', exact: true }).click()
  await expect(oldLink).toBeVisible()
  await page.reload()
  await expect(appMain(page).getByTestId('tab-fiados')).toHaveAttribute('aria-selected', 'true')
  await expect(oldLink).toBeVisible(); await expect(todayLink).toBeVisible()
  await appMain(page).getByTestId('tab-hoy').click()
  expect(new URL(page.url()).searchParams.get('desde')).toBe(ayer)
  await appMain(page).getByTestId('tab-fiados').click()
  await expect(oldLink).toBeVisible()
  await info.attach('fiados-todas-las-fechas', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
})

test('pago mixto revisado: reparto, documentos desde la revisión y resultado recuperable', async ({ page }, info) => {
  test.setTimeout(90000)
  const { cliente, pendiente, viejo, hoy } = await escenario()
  await loginAs(page, 'admin'); await abrirFiados(page, cliente.nombre)
  await llenarCobro(page, '20000')
  await pagoDialog(page).getByRole('button', { name: 'Añadir otro medio', exact: true }).click()
  await pagoDialog(page).getByLabel('Medio 2', { exact: true }).selectOption('NEQUI')
  await pagoDialog(page).getByLabel('Monto 2', { exact: true }).fill('5000')
  await pagoDialog(page).getByRole('button', { name: 'Revisar reparto', exact: true }).click()
  await expect(pagoDialog(page).getByRole('heading', { name: 'Revisar antes de registrar', exact: true })).toBeVisible()
  await expect(pagoDialog(page).getByRole('link', { name: `Ver pedido #${viejo.pedido.numero}`, exact: true })).toBeVisible()
  await expect(pagoDialog(page).getByRole('link', { name: `Ver pedido #${hoy.pedido.numero}`, exact: true })).toBeVisible()
  await pagoDialog(page).getByRole('link', { name: `Ver factura ${hoy.factura.numero}`, exact: true }).click()
  await page.getByTestId('factura-consulta-modal').getByRole('button', { name: 'Volver a la revisión del pago', exact: true }).click()
  const boton = pagoDialog(page).getByRole('button', { name: /Registrar.*25/ })
  const box = await boton.boundingBox()
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  await info.attach('revision-cobro', { body: await page.screenshot(), contentType: 'image/png' })
  const response = page.waitForResponse(r => r.url().endsWith('/api/pedidos/pagar-fiado') && r.request().method() === 'POST')
  await boton.click(); const r = await response; expect(r.status()).toBe(200)
  const body = r.request().postDataJSON()
  const data = await r.json()
  expect(data.pagosAplicados.map((p: { montoAplicado: number }) => p.montoAplicado)).toEqual([20000, 5000])
  await expect(pagoDialog(page).getByRole('heading', { name: 'Pago registrado', exact: true })).toBeVisible()
  await expect(pagoDialog(page)).toContainText('pendiente de confirmación')
  const pagos = await db.pago.findMany({ where: { offlineId: body.offlineId }, include: { abonoEspejo: true } })
  expect(pagos).toHaveLength(2)
  expect(pagos.every(p => p.abonoEspejo?.pagoOrigenId === p.id)).toBe(true)
  expect(Number((await db.pedido.findUniqueOrThrow({ where: { id: pendiente.pedido.id } })).saldo)).toBe(40000)
  await pagoDialog(page).getByRole('button', { name: 'Volver a Fiados', exact: true }).click()
  await page.reload()
  await appMain(page).getByRole('button', { name: 'Ver resultado y documentos', exact: true }).click()
  await expect(pagoDialog(page).getByRole('link', { name: `Ver factura ${hoy.factura.numero}`, exact: true })).toBeVisible()
})

test('deuda modificada por otra persona exige revisar de nuevo sin duplicar el cobro', async ({ page }) => {
  test.setTimeout(90000)
  const { cliente } = await escenario()
  await loginAs(page, 'admin'); await abrirFiados(page, cliente.nombre); await llenarCobro(page, '15000')
  await pagoDialog(page).getByRole('button', { name: 'Revisar reparto', exact: true }).click()
  await expect(pagoDialog(page).getByRole('heading', { name: 'Revisar antes de registrar', exact: true })).toBeVisible()
  expect((await apiPost(page, '/api/pedidos/pagar-fiado', { clienteId: cliente.id, monto: 1000, metodo: 'EFECTIVO', offlineId: randomUUID() })).status()).toBe(200)
  const response = page.waitForResponse(r => r.url().endsWith('/api/pedidos/pagar-fiado') && r.request().method() === 'POST')
  await pagoDialog(page).getByRole('button', { name: /Registrar.*15/ }).click()
  const stale = await response; expect(stale.status()).toBe(409)
  const original = stale.request().postDataJSON()
  expect(await db.pago.count({ where: { offlineId: original.offlineId } })).toBe(0)
  await expect(pagoDialog(page)).toContainText('La deuda cambió')
  await pagoDialog(page).getByRole('button', { name: 'Actualizar reparto', exact: true }).click()
  const retry = page.waitForResponse(r => r.url().endsWith('/api/pedidos/pagar-fiado') && r.request().method() === 'POST')
  await pagoDialog(page).getByRole('button', { name: /Registrar.*15/ }).click()
  const saved = await retry; expect(saved.status()).toBe(200)
  expect(saved.request().postDataJSON().offlineId).toBe(original.offlineId)
  expect(saved.request().postDataJSON().versionDeuda).not.toBe(original.versionDeuda)
  expect(await db.pago.count({ where: { offlineId: original.offlineId } })).toBe(1)
})

test('sin conexión usa la revisión guardada, sincroniza la misma identidad y confirma después', async ({ page, context }) => {
  test.setTimeout(90000)
  const { cliente } = await escenario()
  await loginAs(page, 'admin'); await abrirFiados(page, cliente.nombre); await llenarCobro(page)
  // La fixture desactiva sincronización; comprobar aquí el comportamiento real.
  await page.evaluate(() => { window.__PLAYWRIGHT_TEST__ = false })
  await context.setOffline(true)
  await pagoDialog(page).getByRole('button', { name: 'Revisar reparto', exact: true }).click()
  await expect(pagoDialog(page)).toContainText('Sin conexión. Usamos la deuda consultada')
  await pagoDialog(page).getByRole('button', { name: /Registrar.*10/ }).click()
  await expect(pagoDialog(page).getByRole('heading', { name: 'Pago guardado en este dispositivo', exact: true })).toBeVisible()
  expect(await cola(page, 'requestQueue')).toBe(1)
  expect(await db.pago.count({ where: { pedido: { clienteId: cliente.id } } })).toBe(0)
  await context.setOffline(false)
  await expect(pagoDialog(page).getByRole('heading', { name: 'Pago registrado', exact: true })).toBeVisible({ timeout: 30000 })
  expect(await cola(page, 'requestQueue')).toBe(0)
  expect(await db.pago.count({ where: { pedido: { clienteId: cliente.id } } })).toBe(1)
})

test('ASISTENTE puede cobrar, abrir el pedido y ver su factura (#556)', async ({ page }) => {
  test.setTimeout(90000)
  const { cliente, viejo } = await escenario()
  await loginAs(page, 'asistente'); await abrirFiados(page, cliente.nombre)
  await appMain(page).getByRole('button', { name: 'Ver pedidos', exact: true }).locator('visible=true').click()
  await expect(appMain(page).getByRole('link', { name: `Ver pedido #${viejo.pedido.numero}`, exact: true }).locator('visible=true')).toBeVisible()
  await expect(appMain(page).getByRole('link', { name: `Ver factura ${viejo.factura.numero}`, exact: true }).locator('visible=true')).toBeVisible()
  await appMain(page).getByRole('link', { name: `Ver pedido #${viejo.pedido.numero}`, exact: true }).locator('visible=true').click()
  const detail = page.getByRole('dialog', { name: `Pedido #${viejo.pedido.numero}`, exact: true })
  await expect(detail).toBeVisible()
  await expect(detail.getByRole('link', { name: /Ver factura/ })).toBeVisible()
  await detail.getByRole('button', { name: 'Volver a Fiados', exact: true }).click()
  await llenarCobro(page)
  await pagoDialog(page).getByRole('button', { name: 'Revisar reparto', exact: true }).click()
  await pagoDialog(page).getByRole('button', { name: /Registrar.*10/ }).click()
  await expect(pagoDialog(page).getByRole('heading', { name: 'Pago registrado', exact: true })).toBeVisible()
})

test('la factura fuera de la primera página abre por ID y vuelve a la consulta', async ({ page }) => {
  test.setTimeout(90000)
  const { cliente, viejo } = await escenario()
  const ids = Array.from({ length: 51 }, () => randomUUID())
  await db.pedido.createMany({ data: ids.map(id => ({ id, clienteId: cliente.id, canal: 'PUNTO' as const, origen: 'VENTA_RAPIDA' as const,
    estado: 'ENTREGADO' as const, estadoEntrega: 'ENTREGADO' as const, estadoPago: 'PENDIENTE' as const, total: 1000, saldo: 1000, totalPagado: 0 })) })
  await db.factura.createMany({ data: ids.map(id => ({ numero: `P515-${id}`, clienteId: cliente.id, pedidoId: id, subtotal: 1000, total: 1000, saldo: 1000, montoPagado: 0 })) })
  await loginAs(page, 'admin')
  const volver = `/pedidos?tab=fiados&fiadosBuscar=${encodeURIComponent(cliente.nombre)}`
  await goto(page, `/facturas?${new URLSearchParams({ openFactura: viejo.factura.id, volver })}`)
  const detail = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Detalle de Factura', exact: true }) })
  await expect(detail).toBeVisible(); await expect(detail).toContainText(viejo.factura.numero)
  await detail.getByRole('link', { name: 'Volver a Fiados', exact: true }).click()
  await expect(appMain(page).getByLabel('Buscar cliente', { exact: true })).toHaveValue(cliente.nombre)
})

test('Hoy en Fiados solo filtra la consulta: la revisión y el abono siguen la deuda entregada más antigua', async ({ page }) => {
  test.setTimeout(90000)
  const { cliente, viejo, hoy, pendiente } = await escenario()
  await loginAs(page, 'admin'); await abrirFiados(page, cliente.nombre)
  await appMain(page).getByRole('button', { name: 'Hoy', exact: true }).click()
  const consulta = appMain(page).getByTestId(page.viewportSize()!.width < 768 ? 'fiados-mobile' : 'fiados-desktop')
  await consulta.getByRole('button', { name: 'Ver pedidos', exact: true }).click()
  await expect(consulta.getByRole('link', { name: `Ver pedido #${hoy.pedido.numero}`, exact: true })).toBeVisible()
  await expect(consulta.getByRole('link', { name: `Ver pedido #${viejo.pedido.numero}`, exact: true })).toHaveCount(0)
  await llenarCobro(page)
  await pagoDialog(page).getByRole('button', { name: 'Revisar reparto', exact: true }).click()
  await expect(pagoDialog(page).getByRole('link', { name: `Ver pedido #${viejo.pedido.numero}`, exact: true })).toBeVisible()
  await expect(pagoDialog(page).getByRole('link', { name: `Ver pedido #${hoy.pedido.numero}`, exact: true })).toHaveCount(0)
  await pagoDialog(page).getByRole('button', { name: /Registrar.*10/ }).click()
  await expect(pagoDialog(page).getByRole('heading', { name: 'Pago registrado', exact: true })).toBeVisible()
  expect(Number((await db.pedido.findUniqueOrThrow({ where: { id: viejo.pedido.id } })).saldo)).toBe(10000)
  expect(Number((await db.pedido.findUniqueOrThrow({ where: { id: hoy.pedido.id } })).saldo)).toBe(10000)
  expect(Number((await db.pedido.findUniqueOrThrow({ where: { id: pendiente.pedido.id } })).saldo)).toBe(40000)
})

test('si una factura ya no está disponible muestra el error y regresa a Fiados sin abrir otro documento', async ({ page }) => {
  test.setTimeout(90000)
  const { cliente, viejo } = await escenario()
  await loginAs(page, 'admin'); await abrirFiados(page, cliente.nombre)
  await appMain(page).getByRole('button', { name: 'Ver pedidos', exact: true }).locator('visible=true').click()
  const factura = appMain(page).getByRole('link', { name: `Ver factura ${viejo.factura.numero}`, exact: true }).locator('visible=true')
  await expect(factura).toBeVisible()
  await db.factura.delete({ where: { id: viejo.factura.id } })
  await factura.click()
  const detail = page.getByTestId('factura-consulta-modal')
  await expect(detail).toContainText('Factura no encontrada.')
  await expect(detail.getByText('Detalle de Factura', { exact: true })).toHaveCount(0)
  await detail.getByRole('button', { name: 'Volver a Fiados', exact: true }).click()
  await expect(appMain(page).getByLabel('Buscar cliente', { exact: true })).toHaveValue(cliente.nombre)
  await expect(appMain(page).getByRole('link', { name: `Ver pedido #${viejo.pedido.numero}`, exact: true }).locator('visible=true')).toBeVisible()
})
