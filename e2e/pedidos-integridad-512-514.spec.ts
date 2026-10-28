// @tests #512 #514 — interfaz existente, API y PostgreSQL deben coincidir.
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { test, expect, apiPost, appMain, goto, loginAs, resetTestDatabase } from './fixtures'

const prisma = new PrismaClient()

test.describe('Pedidos: integridad de anulación y cobro #512/#514', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeEach(() => { resetTestDatabase() })
  test.afterAll(async () => { await prisma.$disconnect() })
  test.afterEach(async ({}, info) => {
    console.info('PEDIDOS_512_514_E2E', JSON.stringify({ project: info.project.name, title: info.title, status: info.status, expectedStatus: info.expectedStatus }))
  })

  async function crearPedido(clienteId: string, estado: 'ENTREGADO' | 'PENDIENTE', total: number, pagado = 0, dias = 0) {
    const pedido = await prisma.pedido.create({ data: {
      clienteId, canal: 'DOMICILIO', origen: 'PEDIDO', estado, estadoEntrega: estado,
      estadoPago: pagado ? 'PARCIAL' : 'PENDIENTE', total, totalPagado: pagado, saldo: total - pagado,
      fecha: new Date(Date.now() - dias * 86400000),
      items: { create: [{ producto: 'PACA_AGUA', cantPedido: 4, cantEntrega: estado === 'ENTREGADO' ? 4 : 0, precio: total / 4, subtotal: total }] },
    } })
    await prisma.factura.create({ data: {
      numero: `F-${randomUUID()}`, clienteId, pedidoId: pedido.id,
      total, subtotal: total, montoPagado: pagado, saldo: total - pagado,
    } })
    return pedido
  }

  test('un anulado muestra total cero y conserva el pago y la nota de crédito', async ({ page }, info) => {
    test.setTimeout(60000)
    const c = await prisma.cliente.create({ data: { nombre: 'Anulación sintética', telefono: randomUUID() } })
    const p = await crearPedido(c.id, 'ENTREGADO', 20000, 5000)
    await prisma.pago.create({ data: { pedidoId: p.id, metodo: 'EFECTIVO', monto: 5000 } })
    await loginAs(page, 'admin')
    const response = await apiPost(page, `/api/pedidos/${p.id}/anular`, { motivo: 'Prueba sintética', devolverStock: false, offlineId: randomUUID() })
    expect(response.status()).toBe(200)
    await goto(page, `/pedidos?openPedido=${p.id}`)
    const total = appMain(page).getByText('Total Pedido', { exact: true }).locator('..')
    await expect(total).toContainText(/\$\s*0\b/)
    const post = await prisma.pedido.findUniqueOrThrow({ where: { id: p.id } })
    expect([Number(post.total), Number(post.saldo), Number(post.totalPagado)]).toEqual([0, 0, 0])
    expect(Number((await prisma.notaCredito.findFirstOrThrow({ where: { pedidoId: p.id } })).monto)).toBe(5000)
    expect(await prisma.pago.count({ where: { pedidoId: p.id } })).toBe(1)
    await info.attach('anulado-montos-cero', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
  })

  test('Pagar en Fiados cobra el entregado y deja intacto el pedido pendiente más antiguo', async ({ page }, info) => {
    test.setTimeout(60000)
    const nombre = 'Cobro sintético exigible'
    const c = await prisma.cliente.create({ data: { nombre, telefono: randomUUID() } })
    const pendiente = await crearPedido(c.id, 'PENDIENTE', 20000, 0, 5)
    const entregado = await crearPedido(c.id, 'ENTREGADO', 10000, 0, 2)
    await loginAs(page, 'admin')
    await goto(page, '/pedidos?tab=fiados')
    await appMain(page).getByPlaceholder('Buscar cliente...', { exact: true }).fill(nombre)
    const mobile = (page.viewportSize()?.width ?? 1280) < 768
    const tabla = appMain(page).getByTestId(mobile ? 'fiados-mobile' : 'fiados-desktop')
    await expect(tabla.getByText(nombre, { exact: true })).toBeVisible()
    await tabla.getByRole('button', { name: 'Registrar pago', exact: true }).click()
    const dialog = page.getByTestId('cobro-fiado-dialog')
    await dialog.getByLabel('Medio 1', { exact: true }).selectOption('EFECTIVO')
    await dialog.getByLabel('Monto 1', { exact: true }).fill('10000')
    if (await dialog.getByTestId('cobro-recibio-oficina').count()) await dialog.getByTestId('cobro-recibio-oficina').check()
    await dialog.getByRole('button', { name: 'Revisar reparto', exact: true }).click()
    const respuesta = page.waitForResponse(r => r.url().endsWith('/api/pedidos/pagar-fiado') && r.request().method() === 'POST')
    await dialog.getByRole('button', { name: /Registrar.*10/ }).click()
    const res = await respuesta
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.pagosAplicados).toHaveLength(1)
    expect(body.pagosAplicados[0].pedidoId).toBe(entregado.id)
    const p = await prisma.pedido.findUniqueOrThrow({ where: { id: pendiente.id } })
    expect([Number(p.saldo), Number(p.totalPagado)]).toEqual([20000, 0])
    expect(Number((await prisma.pedido.findUniqueOrThrow({ where: { id: entregado.id } })).saldo)).toBe(0)
    expect(await prisma.pago.count({ where: { pedidoId: pendiente.id } })).toBe(0)
    await expect(dialog.getByRole('heading', { name: 'Pago registrado', exact: true })).toBeVisible()
    await info.attach('fiado-solo-entregado', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
  })
})
