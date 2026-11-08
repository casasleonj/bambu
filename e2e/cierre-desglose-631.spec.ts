// @tests #631 — el cierre muestra de dónde viene lo cobrado, a quién se fió y los pagos por confirmar, con enlaces.
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { test, expect, goto, loginAs, resetTestDatabase } from './fixtures'

const prisma = new PrismaClient()
const fecha = '2001-02-03'
const ayer = '2001-02-02'
const instante = (d: string) => new Date(`${d}T12:00:00-05:00`)

test.describe('Cierre #631: desglose de cobros y fiados', () => {
  test.describe.configure({ mode: 'serial' })
  // #688: el cierre solo lee la base de caja de la fecha; estas pruebas son del desglose, no de la base.
  test.beforeEach(async () => {
    resetTestDatabase()
    for (const dia of [fecha, ayer]) await prisma.config.upsert({ where: { clave: `BASE_DIA_${dia}` }, update: { valor: '50000' }, create: { clave: `BASE_DIA_${dia}`, valor: '50000' } })
  })
  test.afterAll(async () => { await prisma.$disconnect() })

  async function pedido(dia: string, nombre: string, total: number, pagado: number) {
    const cliente = await prisma.cliente.create({ data: { nombre, telefono: randomUUID(), direccion: 'Prueba' } })
    const p = await prisma.pedido.create({ data: {
      clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO', fecha: instante(dia),
      estado: 'ENTREGADO', estadoEntrega: 'ENTREGADO',
      estadoPago: pagado >= total ? 'PAGADO' : pagado > 0 ? 'PARCIAL' : 'PENDIENTE', total, totalPagado: pagado, saldo: total - pagado,
    } })
    return { cliente, p }
  }

  test('#665: los encabezados de los desplegables no se solapan en 360 px y «Pagos por confirmar» separa hoy de días anteriores', async ({ page }) => {
    const a = await pedido(fecha, 'Cliente Encabezado A', 120000, 120000)
    await prisma.pago.create({ data: { pedidoId: a.p.id, metodo: 'NEQUI', monto: 120000, createdAt: instante(fecha) } })
    const previo = await pedido(ayer, 'Cliente Encabezado P', 90000, 90000)
    await prisma.pago.create({ data: { pedidoId: previo.p.id, metodo: 'NEQUI', monto: 90000, createdAt: instante(ayer) } })
    await pedido(fecha, 'Cliente Encabezado C', 60000, 0)

    await loginAs(page, 'admin')
    await page.setViewportSize({ width: 360, height: 800 })
    await goto(page, `/cierre?fecha=${fecha}`)

    const porConfirmar = page.getByTestId('cierre-por-confirmar')
    await expect(porConfirmar).toBeVisible({ timeout: 30000 })
    await expect(porConfirmar.getByTestId('por-confirmar-total')).toContainText('Total: 2 pagos')
    await expect(porConfirmar.getByTestId('por-confirmar-resumen-hoy')).toContainText('Hoy · 1')
    await expect(porConfirmar.getByTestId('por-confirmar-resumen-hoy')).toContainText('120.000')
    await expect(porConfirmar.getByTestId('por-confirmar-resumen-previos')).toContainText('Días anteriores · 1')
    await expect(porConfirmar.getByTestId('por-confirmar-resumen-previos')).toContainText('90.000')

    for (const id of ['cierre-por-confirmar', 'cierre-fiados-del-dia']) {
      const d = page.getByTestId(id)
      const titulo = await d.locator('summary > span').nth(1).boundingBox()
      const resumen = await d.getByTestId('desplegable-resumen').boundingBox()
      expect(titulo, id).not.toBeNull()
      expect(resumen, id).not.toBeNull()
      // el resumen va debajo del título (segunda línea) y el título no se parte letra por letra
      expect(resumen!.y, id).toBeGreaterThanOrEqual(titulo!.y + titulo!.height - 1)
      expect(titulo!.height, id).toBeLessThan(48) // como mucho dos líneas (por palabras, no letra por letra)
      expect(titulo!.width, id).toBeGreaterThan(120)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    if (process.env.SHOT_DIR) {
      await porConfirmar.scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${process.env.SHOT_DIR}/movil-360.png` })
    }

    // Escritorio: el resumen va a la derecha del título, en la misma línea
    await page.setViewportSize({ width: 1280, height: 900 })
    const tD = await page.getByTestId('cierre-fiados-del-dia').locator('summary > span').nth(1).boundingBox()
    const rD = await page.getByTestId('cierre-fiados-del-dia').getByTestId('desplegable-resumen').boundingBox()
    expect(rD!.x).toBeGreaterThan(tD!.x + tD!.width - 1)
    if (process.env.SHOT_DIR) await page.getByTestId('cierre-por-confirmar').screenshot({ path: `${process.env.SHOT_DIR}/escritorio.png` })
  })

  test('muestra efectivo vs digital, fiados con enlaces y pagos por confirmar sin ruido', async ({ page }) => {
    const a = await pedido(fecha, 'Cliente Desglose A', 200000, 200000)
    await prisma.pago.createMany({ data: [
      { pedidoId: a.p.id, metodo: 'EFECTIVO', monto: 150000, createdAt: instante(fecha) },
      { pedidoId: a.p.id, metodo: 'NEQUI', monto: 50000, createdAt: instante(fecha) },
    ] })
    await prisma.factura.create({ data: {
      numero: 'F-631-E2E', pedidoId: a.p.id, clienteId: a.cliente.id,
      subtotal: 200000, total: 200000, montoPagado: 200000, saldo: 0, estado: 'PAGADA', fecha: instante(fecha),
    } })
    const b = await pedido(ayer, 'Cliente Desglose B', 80000, 30000)
    await prisma.pago.create({ data: { pedidoId: b.p.id, metodo: 'TRANSFERENCIA', monto: 30000, createdAt: instante(fecha) } })
    const c = await pedido(fecha, 'Cliente Desglose C', 60000, 0)
    await prisma.gasto.create({ data: { categoria: 'COMBUSTIBLE', descripcion: 'Gasolina camión de reparto', monto: 20000, fecha: instante(fecha), responsable: 'Carlos' } })

    await loginAs(page, 'admin')
    await goto(page, `/cierre?fecha=${fecha}`)

    const efectivo = page.getByTestId('cierre-cobro-efectivo')
    const digital = page.getByTestId('cierre-cobro-digital')
    await expect(efectivo).toContainText('150.000')
    await expect(digital).toContainText('80.000')
    await expect(digital).toContainText('Nequi')
    await expect(digital).toContainText('Transferencia')
    await expect(digital).not.toContainText('Daviplata')
    await expect(page.getByTestId('cierre-desglose-cuadra')).toBeVisible()

    // A quién se fió: desplegable cerrado; al abrirlo, nombre → Fiados filtrado por cliente y # → detalle
    const fiados = page.getByTestId('cierre-fiados-del-dia')
    await expect(fiados).not.toHaveAttribute('open', '')
    await fiados.locator('summary').click()
    await expect(fiados).toContainText('Cliente Desglose C')
    await expect(fiados.getByRole('link', { name: 'Cliente Desglose C' })).toHaveAttribute('href', `/pedidos?tab=fiados&clienteId=${c.cliente.id}`)
    await expect(fiados.getByRole('link', { name: `#${c.p.numero}` })).toHaveAttribute('href', `/pedidos?openPedido=${c.p.id}`)

    // Pagos por confirmar (nacen REPORTADO): pedido, cliente, factura y fecha
    const porConfirmar = page.getByTestId('cierre-por-confirmar')
    await expect(porConfirmar).toBeVisible()
    await porConfirmar.locator('summary').click()
    await expect(porConfirmar).toContainText('F-631-E2E')
    await expect(porConfirmar).toContainText('Cliente Desglose A')

    // Gastos del día: desplegable con descripción, categoría e importe; la ficha del cálculo lo abre
    await expect(page.getByTestId('efectivo-debe-haber')).toBeVisible()
    const gastos = page.getByTestId('cierre-gastos-del-dia')
    await expect(gastos).not.toHaveAttribute('open', '')
    await page.getByRole('link', { name: /− Gastos/ }).click()
    await expect(gastos).toHaveAttribute('open', '')
    await expect(gastos).toContainText('Gasolina camión de reparto')
    await expect(gastos).toContainText('20.000')

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('sin pagos digitales ni fiados no aparece ruido', async ({ page }) => {
    const a = await pedido(fecha, 'Cliente Solo Efectivo', 100000, 100000)
    await prisma.pago.create({ data: { pedidoId: a.p.id, metodo: 'EFECTIVO', monto: 100000, createdAt: instante(fecha) } })
    await loginAs(page, 'admin')
    await goto(page, `/cierre?fecha=${fecha}`)
    await expect(page.getByTestId('cierre-cobro-efectivo')).toContainText('100.000')
    await expect(page.getByTestId('cierre-cobro-digital')).toHaveCount(0)
    await page.getByTestId('cierre-fiados-del-dia').locator('summary').click()
    await expect(page.getByTestId('cierre-fiados-del-dia')).toContainText('Hoy no se fió ningún pedido')
  })
})
