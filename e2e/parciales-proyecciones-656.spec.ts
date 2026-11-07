// @tests #656 #631 #673 — datos sintéticos; entrega directa y deuda parcial.
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { test, expect, resetTestDatabase, applyCachedRoleAuth, skipBaseCaja, goto, appMain } from './fixtures'

const db = new PrismaClient()

test.describe('Importes de entregas parciales', () => {
  test.skip(process.env.NEXT_PUBLIC_PEDIDOS_V2 !== 'true' || process.env.FIADO_ENTREGA_PARCIAL !== 'true', 'requiere Hub y exigibles activos')
  test.setTimeout(60000)
  test.beforeEach(() => resetTestDatabase())
  test.afterAll(() => db.$disconnect())

  test('entrega sin embarque muestra solo lo exigible y conserva factura, retorno y planificación', async ({ page }, info) => {
    const cliente = await db.cliente.create({ data: { nombre: 'Parcial sintético navegador', telefono: randomUUID() } })
    const admin = await db.user.findUniqueOrThrow({ where: { username: 'admin' } })
    const repartidor = await db.trabajador.create({ data: { nombre: 'Repartidor sintético', rol: 'REPARTIDOR', activo: true, usaMoto: true } })
    await db.config.upsert({ where: { clave: 'GESTION_ADMIN_SIN_EMBARQUE' }, create: { clave: 'GESTION_ADMIN_SIN_EMBARQUE', valor: 'true' }, update: { valor: 'true' } })
    const pedido = await db.pedido.create({ data: {
      clienteId: cliente.id, createdById: admin.id, canal: 'DOMICILIO', fecha: new Date(),
      createdAt: new Date(Date.now() - 60000), total: 12000, saldo: 12000,
      cPacaAguaPed: 6, precioPacaAgua: 2000,
      items: { create: { producto: 'PACA_AGUA', cantPedido: 6, cantEntrega: 0, precio: 2000, subtotal: 12000 } },
      factura: { create: { numero: `SYN-${randomUUID().slice(0, 8)}`, clienteId: cliente.id, subtotal: 12000, total: 12000, saldo: 12000 } },
    }, include: { factura: true } })
    await skipBaseCaja(page)
    await applyCachedRoleAuth(page, 'admin')
    await goto(page, `/pedidos?clienteId=${cliente.id}`)
    const row = appMain(page).getByTestId(`operacion-row-${pedido.id}`)
    await row.getByRole('button', { name: 'Registrar entrega', exact: true }).click()
    const entrega = page.getByTestId('registrar-entrega')
    await entrega.getByTestId('alcance-menos').check()
    await entrega.getByLabel('Cantidad entregada de Paca Agua', { exact: true }).fill('4')
    await entrega.getByLabel(/¿Quién lo entregó/).selectOption(repartidor.id)
    await entrega.getByTestId('re-revisar').click()
    await entrega.getByTestId('re-guardar').click()
    await expect(entrega).toHaveCount(0)
    await expect(row).toContainText('6 pedidas · 4 entregadas · 2 por entregar')
    await expect(row).toContainText(/Por cobrar de lo entregado\s*\$\s*8\.000/)
    await expect(row).toContainText(/Pendiente de entrega\s*\$\s*4\.000/)
    await expect(row.getByRole('button', { name: /Planificar en embarque/ })).toBeVisible()
    expect((await db.pedido.findUniqueOrThrow({ where: { id: pedido.id } })).embarqueId).toBeNull()
    expect(await db.entregaExigible.count({ where: { pedidoId: pedido.id } })).toBe(1)
    const resumen = appMain(page).getByTestId('consulta-resumen')
    await expect(resumen).toContainText(/Por cobrar de lo entregado/)
    await row.getByRole('link', { name: `Ver factura ${pedido.factura!.numero}`, exact: true }).click()
    const factura = page.getByTestId('factura-consulta-modal')
    await expect(factura).toContainText(pedido.factura!.numero)
    await factura.getByRole('button', { name: `Volver al pedido #${pedido.numero}`, exact: true }).click()
    const detalle = page.getByRole('dialog', { name: `Pedido #${pedido.numero}`, exact: true })
    await expect(detalle.getByTestId('detalle-importes-parcial')).toContainText(/Por cobrar de lo entregado\s*\$\s*8\.000/)
    await expect(detalle.getByRole('link', { name: 'Consultar y cobrar en Fiados' })).toHaveAttribute('href', `/pedidos?tab=fiados&clienteId=${cliente.id}`)
    await detalle.getByRole('button', { name: 'Volver a Pedidos', exact: true }).click()
    await page.reload()
    await expect(row).toContainText(/Por cobrar de lo entregado\s*\$\s*8\.000/)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: info.outputPath('parcial-exigible.png'), fullPage: true })
    const dia = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    await goto(page, `/cierre?fecha=${dia}`)
    await expect(page.getByTestId('cierre-kpi-ventas')).toContainText(/\$\s*8\.000/)
    await expect(page.getByTestId('cierre-kpi-fiado')).toContainText(/\$\s*8\.000/)
    const fiados = page.getByTestId('cierre-fiados-del-dia')
    await fiados.locator('summary').click()
    await expect(fiados).toContainText(cliente.nombre)
    await expect(fiados.getByRole('link', { name: `#${pedido.numero}`, exact: true })).toHaveAttribute('href', `/pedidos?openPedido=${pedido.id}`)
    await page.screenshot({ path: info.outputPath('cierre-parcial.png'), fullPage: true })
  })
})
