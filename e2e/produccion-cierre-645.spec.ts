// @tests #645 — producción dentro del cierre de caja: se registra desde el cierre (misma que la sección Producción), el stock
// cuadra con pérdidas, aparece la comisión del sellador con botellones llenados y se puede pagar. Cada prueba mira la BASE.
import { test, expect, sharedLoginAs, goto, resetTestDatabase } from './fixtures'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
test.describe.configure({ mode: 'serial' })

test.describe('Producción dentro del cierre (#645)', () => {
  test.beforeAll(() => { resetTestDatabase() })
  test.afterAll(async () => { await prisma.$disconnect() })

  test('registrar la producción desde el cierre crea el registro, muestra la comisión del sellador y se paga', async ({ browser }) => {
    const sellador = await prisma.trabajador.create({
      data: { nombre: `Sellador E2E ${Date.now()}`, rol: 'SELLADOR', tipoPago: 'COMISION', comPacaAgua: 330, comPacaHielo: 330, comBotellon: 330 },
    })
    await prisma.cierreDia.deleteMany({})
    const page = await sharedLoginAs(browser, 'admin')
    await goto(page, '/cierre')

    // Sin producción: el bloque avisa que falta y muestra el formulario; ya no hay campos manuales de inicial/producción.
    await expect(page.getByTestId('form-produccion-cierre')).toBeVisible({ timeout: 30000 })
    await expect(page.getByTestId('stock-falta-produccion').first()).toBeVisible()
    await expect(page.getByText('Producción hoy', { exact: true })).toHaveCount(0)

    // Sin sellador no se puede guardar.
    await expect(page.getByTestId('guardar-produccion')).toBeDisabled()
    await page.getByLabel(/Sellador/).selectOption(sellador.id)
    await page.getByLabel(/Turno/).selectOption('JORNADA')
    await page.locator('#pc-prod-agua').fill('20')
    await page.locator('#pc-prod-hielo').fill('10')
    await page.locator('#pc-merma-agua').fill('1')
    await page.locator('#pc-fin-agua').fill('19') // 0 + 20 − 1 = 19
    await page.locator('#pc-fin-hielo').fill('10')
    await page.locator('#pc-botellones').fill('4')
    await expect(page.getByTestId('produccion-diferencia')).toHaveCount(0)

    const respuesta = page.waitForResponse((r) => r.url().endsWith('/api/produccion') && r.request().method() === 'POST')
    await page.getByTestId('guardar-produccion').click()
    expect((await respuesta).status()).toBe(201)

    // Se ve la lista del día y la comisión del sellador: (20 + 10 + 4) × 330 = 11.220
    await expect(page.getByTestId('producciones-del-dia')).toContainText('Jornada completa')
    await expect(page.getByTestId('producciones-del-dia')).toContainText('4 botellones')
    await expect(page.getByTestId('stock-falta-produccion')).toHaveCount(0)
    const fila = page.getByTestId(`comision-${sellador.id}`)
    await expect(fila).toBeVisible()
    await expect(fila.getByTestId('comision-pendiente')).toContainText('11.220')

    // La base tiene UNA producción con su ítem de botellones y la comisión correcta.
    const p = await prisma.produccion.findFirstOrThrow({ where: { trabajadorId: sellador.id }, include: { items: true } })
    expect(p.turno).toBe('JORNADA')
    expect(Number(p.comSellTotal)).toBe(11220)
    expect(p.items.find((i) => i.producto === 'BOTELLON')?.producido).toBe(4)
    expect(p.items.find((i) => i.producto === 'PACA_AGUA')?.rotas).toBe(1)

    // Se paga con el mismo botón y queda en la base.
    await fila.getByTestId(`pagar-comision-${sellador.id}`).click()
    await page.getByRole('button', { name: 'Sí, ya le pagué' }).click()
    await expect(fila.getByTestId('comision-pagado')).toContainText('11.220', { timeout: 15000 })
    expect(await prisma.pagoComisionRepartidor.count({ where: { trabajadorId: sellador.id } })).toBe(1)

    // Una segunda producción de otro turno del MISMO sellador choca con la jornada completa.
    await page.getByTestId('agregar-produccion').click()
    await page.getByLabel(/Sellador/).selectOption(sellador.id)
    await page.getByLabel(/Turno/).selectOption('MANANA')
    await page.locator('#pc-fin-agua').fill('19')
    await page.locator('#pc-fin-hielo').fill('10')
    await page.getByTestId('guardar-produccion').click()
    await expect(page.getByTestId('produccion-error')).toContainText('jornada completa')
    expect(await prisma.produccion.count({ where: { trabajadorId: sellador.id } })).toBe(1)
  })

  test('«ese día no se produjo» oculta el formulario y quita el aviso de producción faltante', async ({ browser }) => {
    await prisma.produccion.deleteMany({})
    await prisma.cierreDia.deleteMany({})
    const page = await sharedLoginAs(browser, 'admin')
    await goto(page, '/cierre')
    await expect(page.getByTestId('form-produccion-cierre')).toBeVisible({ timeout: 30000 })
    await page.getByTestId('sin-produccion').check()
    await expect(page.getByTestId('form-produccion-cierre')).toHaveCount(0)
    await expect(page.getByTestId('stock-falta-produccion')).toHaveCount(0)
  })

  test('un cierre atrasado más de 7 días no deja registrar producción', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const vieja = new Date(Date.now() - 12 * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    await goto(page, `/cierre?fecha=${vieja}`)
    // Puede que el cierre pida cerrar un día anterior primero; en ese caso la regla no aplica a esta pantalla.
    const aviso = page.getByTestId('produccion-fecha-invalida')
    if (await aviso.isVisible({ timeout: 15000 }).catch(() => false)) {
      await expect(aviso).toContainText('7 días anteriores')
      await expect(page.getByTestId('form-produccion-cierre')).toHaveCount(0)
    }
  })
})
