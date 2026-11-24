// @tests #992: QA de navegador del pago desde Cierre.
// Solo PostgreSQL sintetico, efimero, en localhost dentro de GitHub Actions.
import { PrismaClient } from '@prisma/client'
import { test, expect, loginAs, goto, apiPost, resetDatabase } from './fixtures'

test.describe('QA #992: Cierre a Nomina', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeAll(() => {
    if (process.env.CI !== 'true' || !process.env.DATABASE_URL?.includes('localhost')) {
      throw new Error('QA #992 prohibe ejecutar contra base de produccion.')
    }
    resetDatabase()
  })

  test('pago retroactivo por Cierre: UI, persistencia y no doble egreso', async ({ page }) => {
    await loginAs(page, 'admin')

    const nombre = 'QA Sintetico Sueldo 992 ' + Date.now()
    const nuevo = await apiPost(page, '/api/trabajadores', {
      nombre, rol: 'ADMIN', tipoPago: 'FIJO', usaMoto: false,
      salarioFijo: 400000, frecuenciaPago: 'QUINCENAL', pagoFueraDeCaja: true,
    })
    expect(nuevo.status()).toBe(201)
    const creado = await nuevo.json()
    const trabajadorId: string = creado.trabajador.id

    // Preparacion sintetica: API Trabajadores asigna frecuenciaDesde = now().
    const db = new PrismaClient()
    try {
      await db.trabajador.update({
        where: { id: trabajadorId },
        data: { frecuenciaDesde: new Date('2026-11-14T12:00:00Z') },
      })
    } finally {
      await db.$disconnect()
    }

    const fechaSueldo = '2026-11-15'
    const fechaPago = '2026-11-16'
    await goto(page, '/cierre?fecha=' + fechaSueldo)
    const tarjeta = page.getByTestId('sueldo-' + trabajadorId + '-' + fechaSueldo)
    await expect(tarjeta).toBeVisible({ timeout: 20000 })
    await expect(tarjeta).toContainText(nombre)

    await page.getByTestId('sueldo-otro-dia-' + trabajadorId + '-' + fechaSueldo).click()
    await page.getByTestId('sueldo-fecha-' + trabajadorId + '-' + fechaSueldo).fill(fechaPago)
    await page.getByTestId('sueldo-motivo-' + trabajadorId + '-' + fechaSueldo)
      .fill('QA sintetico 992: pago en una fecha distinta')
    await page.getByTestId('pagar-sueldo-' + trabajadorId).click()
    await expect(page.getByRole('button', { name: 'Sí, pagar' })).toBeVisible()

    const respuesta = page.waitForResponse(
      r => r.url().includes('/api/nomina/sueldo/pagar') && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Sí, pagar' }).click()
    expect((await respuesta).status()).toBe(201)
    await expect(page.getByText('Sueldo pagado a ' + nombre)).toBeVisible({ timeout: 10000 })

    await expect(tarjeta).toHaveCount(0, { timeout: 20000 })
    await page.screenshot({ path: test.info().outputPath('qa-992-cierre-despues-de-pagar.png'), fullPage: true })
    await page.reload()
    await expect(page.getByTestId('sueldo-' + trabajadorId + '-' + fechaSueldo)).toHaveCount(0, { timeout: 20000 })

    const check = new PrismaClient()
    try {
      const nominas = await check.nomina.findMany({ where: { trabajadorId } })
      expect(nominas).toHaveLength(1)
      expect(nominas[0].estado).toBe('PAGADA')
      expect(nominas[0].pagoFueraDeCaja).toBe(true)
      expect(nominas[0].fechaPago?.toISOString().slice(0, 10)).toBe(fechaPago)
      const gastos = await check.gasto.count({ where: { trabajadorId, categoria: 'NOMINA' } })
      expect(gastos).toBe(0)
    } finally {
      await check.$disconnect()
    }
  })
})
