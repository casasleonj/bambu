// #932: prueba de navegador contra la consulta real, con datos sintéticos.
// El badge informa; no registra cobros ni cambia el FIFO.
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { test, expect, loginAs, goto, appMain, resetTestDatabase } from './fixtures'

const db = new PrismaClient()

test.describe('#932 Cobro pendiente en General de Pedidos', () => {
  test.skip(process.env.NEXT_PUBLIC_PEDIDOS_V2 !== 'true', 'requiere Hub V2')
  test.setTimeout(120_000)
  test.beforeEach(() => resetTestDatabase())
  test.afterAll(() => db.$disconnect())

  for (const [dispositivo, viewport] of [
    ['escritorio', { width: 1280, height: 850 }],
    ['móvil', { width: 390, height: 844 }],
  ] as const) {
    test(dispositivo + ': pedido pagado alerta deuda de OTRO pedido creado después', async ({ page }) => {
      await page.setViewportSize(viewport)
      const cliente = await db.cliente.create({
        data: { nombre: 'Cobro932 ' + randomUUID().slice(0, 8), telefono: randomUUID() },
      })
      const pedidoPagado = await db.pedido.create({
        data: {
          clienteId: cliente.id,
          fecha: new Date('2026-11-18T14:00:00.000Z'),
          createdAt: new Date('2026-11-18T14:00:00.000Z'),
          estado: 'ENTREGADO', estadoEntrega: 'ENTREGADO', estadoPago: 'PAGADO',
          total: 9000, totalPagado: 9000, saldo: 0,
          cPacaAguaPed: 3, cPacaAguaEnt: 3, precioPacaAgua: 3000,
        },
      })
      const deudaPosterior = await db.pedido.create({
        data: {
          clienteId: cliente.id,
          fecha: new Date('2026-11-20T14:00:00.000Z'),
          createdAt: new Date('2026-11-20T14:00:00.000Z'),
          estado: 'ENTREGADO', estadoEntrega: 'ENTREGADO', estadoPago: 'PENDIENTE',
          total: 5000, totalPagado: 0, saldo: 5000,
          cPacaAguaPed: 2, cPacaAguaEnt: 2, precioPacaAgua: 2500,
        },
      })

      await loginAs(page, 'admin')
      await goto(page, '/pedidos?all=true&pageSize=100')
      const app = appMain(page)
      const badge = app.getByTestId('fiados-anteriores-' + pedidoPagado.id)
      await expect(badge).toBeVisible({ timeout: 20_000 })
      await expect(badge).toContainText('Cobro pendiente')
      await expect(app.getByTestId('fiados-anteriores-' + deudaPosterior.id)).toHaveCount(0)
      if (dispositivo === 'escritorio') {
        await badge.hover()
      } else {
        await badge.locator('summary').click()
      }
      const detalle = badge.getByRole('region', { name: 'Detalle de otros cobros pendientes' })
      await expect(detalle).toBeVisible()
      await expect(detalle).toContainText('Otros pedidos (1)')
      await expect(detalle).toContainText('5.000')
      await expect(detalle).toContainText('Este pedido')
      await expect(detalle).toContainText('Pedido #' + deudaPosterior.numero)
      await expect(detalle).toContainText('2 Pacas')
      // El panel móvil debe empujar la tarjeta, no salir de su viewport.
      if (dispositivo === 'móvil') {
        const horizontal = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
        expect(horizontal).toBe(false)
      }
      await detalle.getByRole('link', { name: 'Ver fiados del cliente' }).click()
      await expect(page).toHaveURL(/tab=fiados/)
      await expect(page).toHaveURL(new RegExp('fiadosCliente=' + cliente.id))
    })
  }
})
