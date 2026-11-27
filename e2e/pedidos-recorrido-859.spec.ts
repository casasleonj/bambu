// @tests #859: cambio Recorrido↔Cercanía sin borrar orden, Llevar primero y restablecer.
// Solo CI/test DB. Nunca apunta a la producción real.
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { test, expect, loginAs, goto, resetTestDatabase, appMain } from './fixtures'

const db = new PrismaClient()
const fecha = new Date('2026-11-10T15:00:00Z')

async function generarPedidoEnBarrio(nombreBarrio: string) {
  const barrio = await db.barrio.create({
    data: { nombre: nombreBarrio, nombreNormalizado: nombreBarrio.toLowerCase() },
  })
  const cliente = await db.cliente.create({
    data: { nombre: 'E2E Recorrido ' + randomUUID().slice(0,8), telefono: randomUUID(),
      barrioId: barrio.id, barrio: nombreBarrio },
  })
  const admin = await db.user.findUniqueOrThrow({ where: { username:'admin' } })
  await db.pedido.create({
    data: {
      clienteId: cliente.id, createdById: admin.id, canal: 'DOMICILIO',
      origen: 'PEDIDO', fecha, createdAt: fecha,
      estado: 'PENDIENTE', estadoEntrega: 'PENDIENTE', estadoPago: 'PENDIENTE',
      total: 2300, totalPagado: 0, saldo: 2300,
      items: { create: { producto: 'PACA_AGUA', cantPedido: 1, cantEntrega: 0, precio: 2300, subtotal: 2300 } },
    },
  })
  return barrio.id
}

test.describe('#859 Recorrido temporal por barrios', () => {
  test.skip(process.env.NEXT_PUBLIC_PEDIDOS_V2 !== 'true', 'requiere Hub V2 activo')
  test.setTimeout(120_000)
  test.beforeEach(() => resetTestDatabase())
  test.afterAll(() => db.$disconnect())

  for (const [vista, viewport] of [
    ['escritorio', {width:1280,height:850}],
    ['móvil',{width:390,height:844}],
  ] as const) {
    test(vista + ': Recorrido contrae pedidos y permite mover barrio a posición', async ({page}) => {
      await page.setViewportSize(viewport)
      const centroId = await generarPedidoEnBarrio('Centro')
      const villaId = await generarPedidoEnBarrio('Villa Nueva')
      await loginAs(page,'admin')
      await goto(page,'/pedidos?all=true&agrupar=barrio&pageSize=25')
      const app = appMain(page)
      await expect(app.getByTestId('pedidos-agrupados-barrio')).toBeVisible()
      await app.getByTestId('recorrido-toggle').click()
      const centroToggle = app.getByTestId('grupo-barrio-toggle-b:'+centroId)
      await expect(centroToggle).toHaveAttribute('aria-expanded','false')
      await expect(app.locator('[data-testid^="operacion-row-"]')).toHaveCount(0)
      await centroToggle.click()
      await expect(centroToggle).toHaveAttribute('aria-expanded','true')
      await expect(app.locator('[data-testid^="operacion-row-"]')).toHaveCount(1)
      await centroToggle.click()

      await app.getByTestId('recorrido-barrio-select').selectOption('b:'+villaId)
      await app.getByTestId('recorrido-posicion-global').selectOption('1')
      await expect.poll(() => new URL(page.url()).searchParams.getAll('recorrido')[0]).toBe('b:'+villaId)
      await expect(app.getByTestId('grupo-barrio-toggle-b:'+villaId)).toHaveAttribute('aria-expanded','false')
    })

    test(vista + ': Llevar primero se conserva al entrar a Cercanía y se restablece', async ({page}) => {
      await page.setViewportSize(viewport)
      const centroId = await generarPedidoEnBarrio('Centro')
      const villaId = await generarPedidoEnBarrio('Villa Nueva')
      await loginAs(page,'admin')
      await goto(page,'/pedidos?all=true&agrupar=barrio&pageSize=25')
      const app = appMain(page)
      await expect(app.getByTestId('pedidos-agrupados-barrio')).toBeVisible()
      await app.getByTestId('recorrido-toggle').click()
      const selector = app.getByTestId('recorrido-barrio-select')
      await expect(selector).toBeVisible()
      await selector.selectOption('b:'+villaId)
      await app.getByTestId('recorrido-priorizar').click()

      await expect.poll(() => new URL(page.url()).searchParams.getAll('recorrido')[0]).toBe('b:'+villaId)
      await expect(app.getByTestId('recorrido-restablecer')).toBeVisible()

      // La consulta GPS es independiente y suspende el orden sin borrarlo.
      await app.getByTestId('cercania-toggle').click()
      await expect(app.getByTestId('cercania-toggle')).toHaveAttribute('aria-pressed','true')
      await expect.poll(() => new URL(page.url()).searchParams.getAll('recorrido').length).toBe(0)
      await app.getByTestId('recorrido-toggle').click()
      await expect(app.getByTestId('recorrido-toggle')).toHaveAttribute('aria-pressed','true')
      await expect.poll(() => new URL(page.url()).searchParams.getAll('recorrido')[0]).toBe('b:'+villaId)

      // Restablecer vuelve al orden aproximado desde la marca en San José;
      // Centro es conocido, Villa Nueva sin centro confirmado queda visible.
      await app.getByTestId('recorrido-restablecer').click()
      await expect.poll(() => new URL(page.url()).searchParams.getAll('recorrido')[0]).toBe('b:'+centroId)
      await expect.poll(() => new URL(page.url()).searchParams.getAll('recorrido')).toContain('b:'+villaId)
    })
  }
})
