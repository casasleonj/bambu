// @tests #929: indicador transversal y estado de gestión desde PostgreSQL de pruebas.
// No usa datos productivos ni cambia el orden comercial de Pedidos.
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { test, expect, loginAs, goto, appMain, resetTestDatabase } from './fixtures'

const db = new PrismaClient()
const diaBogota = (desplazamiento = 0) => {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  const base = new Date(`${hoy}T00:00:00-05:00`)
  return new Date(base.getTime() + desplazamiento * 86_400_000)
}
async function crearPedidoRiesgo(nombre: string, config: {
  parcial?: boolean; futuro?: boolean; estadoEntrega?: 'PENDIENTE' | 'ENTREGADO'
} = {}) {
  const admin = await db.user.findUniqueOrThrow({ where: { username: 'admin' } })
  const cliente = await db.cliente.create({
    data: { nombre: `${nombre}-${randomUUID().slice(0, 6)}`, telefono: randomUUID(), barrio: 'Centro Riesgo' },
  })
  const fecha = new Date(diaBogota(-2).getTime() + 6 * 3_600_000)
  const estadoEntrega = config.estadoEntrega ?? 'PENDIENTE'
  const p = await db.pedido.create({
    data: {
      clienteId: cliente.id, createdById: admin.id, fecha, createdAt: fecha,
      fechaEntrega: config.futuro ? new Date(diaBogota(1).getTime() + 12 * 3_600_000) : null,
      canal: 'DOMICILIO', origen: 'PEDIDO', estado: estadoEntrega,
      estadoEntrega, estadoPago: 'PENDIENTE', total: 6900, totalPagado: 0, saldo: 6900,
      items: { create: {
        producto: 'PACA_AGUA', cantPedido: 3,
        cantEntrega: config.parcial || estadoEntrega === 'ENTREGADO' ? 1 : 0,
        precio: 2300, subtotal: 6900,
      } },
    },
  })
  return p.id
}
test.describe('#929 alertas operativas en las tarjetas', () => {
  test.skip(process.env.NEXT_PUBLIC_PEDIDOS_V2 !== 'true', 'requiere Hub V2')
  test.setTimeout(120_000)
  test.beforeEach(() => resetTestDatabase())
  test.afterAll(() => db.$disconnect())

  for (const [dispositivo, viewport] of [
    ['escritorio', { width: 1280, height: 850 }],
    ['móvil', { width: 390, height: 844 }],
  ] as const) {
    test(`${dispositivo}: General, barrio, parcial, futuro y actualización de estado`, async ({ page }) => {
      await page.setViewportSize(viewport)
      const pendiente = await crearPedidoRiesgo('Riesgo929')
      const parcial = await crearPedidoRiesgo('Parcial929', { parcial: true })
      const futuro = await crearPedidoRiesgo('Futuro929', { futuro: true })
      const entregado = await crearPedidoRiesgo('Cerrado929', { estadoEntrega: 'ENTREGADO' })
      await loginAs(page, 'admin')
      await goto(page, '/pedidos?all=true&pageSize=100')
      const app = appMain(page)
      await expect(app.getByTestId(`operacion-riesgo-${pendiente}`)).toContainText('Sin gestionar')
      await expect(app.getByTestId(`operacion-riesgo-${parcial}`)).toHaveCount(0)
      await expect(app.getByTestId(`operacion-riesgo-${futuro}`)).toHaveCount(0)
      await expect(app.getByTestId(`operacion-riesgo-${entregado}`)).toHaveCount(0)

      await goto(page, '/pedidos?all=true&agrupar=barrio&pageSize=100')
      await expect(app.getByTestId('pedidos-agrupados-barrio')).toBeVisible()
      await expect(app.getByTestId(`operacion-riesgo-${pendiente}`)).toContainText('Sin gestionar')
      await expect(app.getByTestId(`operacion-riesgo-${parcial}`)).toHaveCount(0)

      // Gestión desde otro dispositivo/actor (DB aislada): recargar no conserva alarma vieja.
      await db.pedido.update({ where: { id: pendiente }, data: { estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO' } })
      await page.reload()
      await expect(app.getByTestId(`operacion-riesgo-${pendiente}`)).toHaveCount(0)
    })
  }
})
