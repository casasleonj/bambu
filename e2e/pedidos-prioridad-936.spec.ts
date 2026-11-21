// #936: QA automática de navegador REAL, usa exclusivamente PostgreSQL sintético del runner.
// No sustituye el QA humano de escritorio/móvil, ni mide concurrencia de usuarios.
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { test, expect, loginAs, goto, appMain, resetTestDatabase } from './fixtures'

const db = new PrismaClient()
const fechaHoy = () => new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) + 'T10:00:00-05:00')

async function preparar() {
  const admin = await db.user.findUniqueOrThrow({ where: { username: 'admin' } })
  const cliente = await db.cliente.create({
    data: { nombre: 'QA936 Browser ' + randomUUID().slice(0, 8), telefono: randomUUID() },
  })
  const ahora = Date.now()
  const pedidos: Record<string, string> = {}
  async function crear(nombre: string, horasAntes: number, opciones: {
    pago?: 'CONFIRMADO' | 'REPORTADO'; parcial?: boolean; entregado?: boolean
  } = {}) {
    const pagado = opciones.pago ? 1000 : opciones.parcial ? 300 : 0
    const entrega = opciones.entregado ? 1 : 0
    const e = opciones.entregado ? 'ENTREGADO' : 'PENDIENTE'
    const p = await db.pedido.create({ data: {
      clienteId: cliente.id, createdById: admin.id, canal: 'DOMICILIO', origen: 'PEDIDO',
      fecha: fechaHoy(), createdAt: new Date(ahora - horasAntes * 3600000),
      estado: e, estadoEntrega: e,
      estadoPago: opciones.entregado
        ? (pagado === 1000 ? 'PAGADO' : 'PENDIENTE')
        : pagado === 1000 ? 'ANTICIPADO' : pagado > 0 ? 'PARCIAL' : 'PENDIENTE',
      total: 1000, totalPagado: pagado, saldo: 1000 - pagado,
      items: { create: { producto: 'PACA_AGUA', cantPedido: 1, cantEntrega: entrega, precio: 1000, subtotal: 1000 } },
    } })
    if (pagado > 0) {
      await db.pago.create({ data: {
        pedidoId: p.id, monto: pagado, metodo: 'NEQUI',
        confirmacion: opciones.pago ?? 'CONFIRMADO',
      } })
    }
    pedidos[nombre] = p.id
  }
  await crear('pagadoAntiguo', 8, { pago: 'CONFIRMADO' })
  await crear('pagadoNuevo', 3, { pago: 'CONFIRMADO' })
  await crear('anticipo', 2, { parcial: true })
  await crear('reportado', 48, { pago: 'REPORTADO' })
  await crear('sinPago', 10)
  await crear('entregadoConDeuda', 55, { entregado: true })
  await crear('completado', 70, { entregado: true, pago: 'CONFIRMADO' })
  return { cliente, pedidos }
}

test.describe('#936 · orden FIFO y paginación reales en Hub V2', () => {
  test.skip(process.env.NEXT_PUBLIC_PEDIDOS_V2 !== 'true', 'requiere Hub V2')
  test.setTimeout(120000)
  test.beforeEach(() => resetTestDatabase())
  test.afterAll(() => db.$disconnect())

  for (const [dispositivo, viewport] of [
    ['escritorio', { width: 1280, height: 850 }],
    ['móvil', { width: 390, height: 844 }],
  ] as const) {
    test(dispositivo + ': prioridad, FIFO, pago reportado y tres páginas sin duplicación', async ({ page }, info) => {
      await page.setViewportSize(viewport)
      const { cliente, pedidos } = await preparar()
      await loginAs(page, 'admin')
      const esperado = [
        pedidos.pagadoAntiguo, pedidos.pagadoNuevo, pedidos.anticipo,
        pedidos.reportado, pedidos.sinPago, pedidos.entregadoConDeuda, pedidos.completado,
      ]
      const vistos: string[] = []
      for (let pagina = 1; pagina <= 3; pagina++) {
        await goto(page, `/pedidos?all=true&clienteId=${cliente.id}&agrupar=&pageSize=3&page=${pagina}`)
        const app = appMain(page)
        const filas = app.locator('[data-testid^="operacion-row-"]')
        await expect(filas).toHaveCount(pagina === 3 ? 1 : 3, { timeout: 20000 })
        const identificadores = await filas.evaluateAll(elementos => elementos.map(
          el => el.getAttribute('data-testid')?.replace('operacion-row-', '') ?? '',
        ))
        vistos.push(...identificadores)
        await expect(app.getByTestId('pedidos-agrupados-barrio')).toHaveCount(0)
        if (pagina === 1 || pagina === 3) {
          // Evidencia visual reproducible; la captura contiene solo clientes
          // sintéticos sembrados por la suite de CI, nunca datos de producción.
          await info.attach(`qa936-${dispositivo}-pagina-${pagina}`, {
            body: await page.screenshot({ fullPage: true }),
            contentType: 'image/png',
          })
        }
      }
      expect(vistos).toEqual(esperado)
      expect(new Set(vistos).size).toBe(7)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    })
  }
})
