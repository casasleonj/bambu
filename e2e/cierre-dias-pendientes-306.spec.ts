// @tests #306 — el cierre deja elegir qué día cerrar; un día con movimientos no se salta (nadie) y uno vacío es opcional.
import { PrismaClient } from '@prisma/client'
import { test, expect, goto, loginAs, resetTestDatabase } from './fixtures'

const prisma = new PrismaClient()
const bogota = (offsetDias: number) =>
  new Date(Date.now() + offsetDias * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const mediodia = (d: string) => new Date(`${d}T12:00:00-05:00`)

test.describe('Cierre #306: días pendientes', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeEach(() => { resetTestDatabase() })
  test.afterAll(async () => { await prisma.$disconnect() })

  test('un día con movimientos bloquea; «Ir a cerrar» lo elige; el vacío es opcional (360 px sin desborde)', async ({ page }) => {
    const admin = await prisma.user.findFirstOrThrow({ where: { rol: 'ADMIN' } })
    const conMov = bogota(-2)
    const vacio = bogota(-1)
    await prisma.cierreDia.create({ data: { fecha: mediodia(bogota(-3)), cerradoPor: admin.id } })
    await prisma.gasto.create({ data: { fecha: mediodia(conMov), categoria: 'OTROS', monto: 5000, descripcion: 'dia-con-movimiento-306', createdById: admin.id } })

    await loginAs(page, 'admin')
    await page.setViewportSize({ width: 360, height: 800 })
    await goto(page, '/cierre')

    const lista = page.getByTestId('dias-pendientes')
    await expect(lista).toBeVisible({ timeout: 30000 })
    await expect(page.getByTestId(`dia-pendiente-${conMov}`)).toContainText('1 movimiento · hay que cerrarlo')
    await expect(page.getByTestId(`dia-pendiente-${vacio}`)).toContainText('Sin movimientos · opcional')
    await expect(page.getByTestId('dias-pendientes-bloqueo')).toContainText('Ciérralo primero')
    await expect(page.getByRole('button', { name: /saltar/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Cerrar Día' })).toBeDisabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

    await page.getByRole('button', { name: /^Ir a cerrar el/ }).click()
    await expect(page.getByTestId(`dia-pendiente-${conMov}`)).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('dias-pendientes-bloqueo')).toHaveCount(0)

    await page.getByTestId(`dia-pendiente-${vacio}`).click()
    await expect(page.getByTestId(`dia-pendiente-${vacio}`)).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('dias-pendientes-bloqueo')).toBeVisible()
  })
})
