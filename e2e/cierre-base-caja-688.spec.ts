// @tests #688 — el cierre lee la base de caja de la fecha: se ve de dónde viene, se actualiza si la editan, exige ingresarla
// si falta y no deja cerrar con una vieja. Cada prueba mira la BASE (no solo la pantalla).
import { PrismaClient } from '@prisma/client'
import { test, expect, goto, loginAs, resetTestDatabase } from './fixtures'

const prisma = new PrismaClient()
const fecha = '2001-03-04'
const sinBase = '2001-03-03'
const clave = (dia: string) => `BASE_DIA_${dia}`
const fijarBase = (dia: string, valor: number) =>
  prisma.config.upsert({ where: { clave: clave(dia) }, update: { valor: String(valor) }, create: { clave: clave(dia), valor: String(valor) } })

test.describe('Cierre #688: la base de caja la ingresa «Caja base» y el cierre solo la lee', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeEach(async () => {
    resetTestDatabase()
    await prisma.cierreDia.deleteMany({})
  })
  test.afterAll(async () => { await prisma.$disconnect() })

  test('muestra la base con su fuente, sin ningún campo para escribirla, y se actualiza si la editan con el cierre abierto', async ({ page }) => {
    await fijarBase(fecha, 50000)
    await loginAs(page, 'admin')
    await goto(page, `/cierre?fecha=${fecha}`)
    const hero = page.getByTestId('cierre-efectivo-esperado')
    await expect(hero).toContainText('Empezó con $ 50.000', { timeout: 30000 })
    await expect(page.getByTestId('base-caja-fuente')).toContainText('Base de caja del 4 mar')
    await expect(page.getByLabel('Efectivo con el que empezó el día')).toHaveCount(0)
    await expect(page.getByTestId('efectivo-debe-haber')).toContainText('50.000')

    // Alguien edita la base en otra sesión; al volver a esta pestaña el cierre la lee solo y avisa.
    await fijarBase(fecha, 60000)
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(hero).toContainText('Empezó con $ 60.000')
    await expect(page.getByTestId('base-caja-aviso')).toContainText('Base de caja actualizada')
    await expect(page.getByTestId('base-caja-aviso')).toContainText(/de \$\s*50\.000 a \$\s*60\.000/)
    await expect(page.getByTestId('efectivo-debe-haber')).toContainText('60.000')
    await page.getByRole('button', { name: 'Entendido' }).click()
    await expect(page.getByTestId('base-caja-aviso')).toHaveCount(0)
  })

  test('si la base cambió justo antes de cerrar, no se abre la confirmación ni se cierra; se revisa y recién entonces cierra con la vigente', async ({ page }) => {
    await fijarBase(fecha, 50000)
    await loginAs(page, 'admin')
    await goto(page, `/cierre?fecha=${fecha}`)
    await expect(page.getByTestId('cierre-efectivo-esperado')).toContainText('Empezó con $ 50.000', { timeout: 30000 })
    await page.getByRole('button', { name: 'Contar Efectivo Físico' }).click()
    await page.getByRole('button', { name: 'Sumar 1 a $10.000', exact: true }).click()
    await page.getByRole('button', { name: /Terminar conteo/ }).click()

    await fijarBase(fecha, 15000) // se edita la base después de cargar la pantalla
    await page.getByRole('button', { name: 'Cerrar Día', exact: true }).click()
    const aviso = page.getByTestId('base-caja-cambio')
    await expect(aviso).toBeVisible()
    await expect(aviso).toContainText('La base de caja cambió')
    await expect(aviso).toContainText(/\$\s*50\.000/)
    await expect(aviso).toContainText(/\$\s*15\.000/)
    await expect(page.getByRole('dialog', { name: 'Confirmar cierre del día' })).toHaveCount(0)
    expect(await prisma.cierreDia.count()).toBe(0)

    await page.getByTestId('base-caja-revisar').click()
    await expect(page.getByTestId('cierre-efectivo-esperado')).toContainText('Empezó con $ 15.000')
    await page.getByRole('button', { name: 'Cerrar Día', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Confirmar cierre del día' })
    await dialog.getByRole('checkbox').check()
    const respuesta = page.waitForResponse(r => r.url().endsWith('/api/cierre') && r.request().method() === 'POST')
    await dialog.getByRole('button', { name: 'Confirmar cierre', exact: true }).click()
    expect((await respuesta).status()).toBe(201)
    await expect(page.getByRole('heading', { name: 'Día cerrado', exact: true })).toBeVisible()
    const guardado = await prisma.cierreDia.findFirstOrThrow()
    expect(Number(guardado.baseDia)).toBe(15000) // el cierre quedó con la base vigente, no la vieja
  })

  test('sin base ese día no inventa un valor: avisa, bloquea «Cerrar Día» y un día atrasado la guarda como la base de esa fecha', async ({ page }) => {
    // Hay un valor por defecto en Configuración: no debe usarse en silencio.
    await prisma.config.upsert({ where: { clave: 'BASE_DIA' }, update: { valor: '100000' }, create: { clave: 'BASE_DIA', valor: '100000' } })
    await loginAs(page, 'admin')
    await goto(page, `/cierre?fecha=${sinBase}`)
    const faltante = page.getByTestId('base-caja-faltante')
    await expect(faltante).toBeVisible({ timeout: 30000 })
    await expect(faltante).toContainText('Falta la base de caja del 3 mar')
    await expect(page.getByTestId('efectivo-debe-haber')).toHaveText('—')
    await expect(page.getByTestId('cierre-efectivo-esperado')).not.toContainText('100.000')
    await expect(page.getByRole('button', { name: 'Cerrar Día', exact: true })).toBeDisabled()

    // El servidor tampoco cierra sin base aunque la pantalla lo intente.
    const res = await page.request.post('/api/cierre', { data: {
      fecha: sinBase, baseDia: 100000, stockIniAgua: 0, prodAgua: 0, stockFinAgua: 0, stockIniHielo: 0, prodHielo: 0, stockFinHielo: 0,
      salarios: 0, reporte: JSON.stringify({ arqueo: { 10000: 1 } }),
    } })
    expect(res.status()).toBe(422)
    expect((await res.json()).error.code).toBe('BASE_FALTANTE')
    expect(await prisma.cierreDia.count()).toBe(0)

    // Se ingresa como la base de caja de esa fecha (queda registrada en la configuración, no solo en la pantalla).
    await page.getByTestId('base-caja-input').fill('45000')
    await page.getByTestId('base-caja-guardar').click()
    await expect(page.getByTestId('cierre-efectivo-esperado')).toContainText('Empezó con $ 45.000', { timeout: 15000 })
    await expect(faltante).toHaveCount(0)
    expect((await prisma.config.findUniqueOrThrow({ where: { clave: clave(sinBase) } })).valor).toBe('45000')
  })

  test('en móvil la ficha, el aviso y el faltante no se solapan ni desbordan', async ({ page }) => {
    await fijarBase(fecha, 50000)
    await loginAs(page, 'admin')
    await page.setViewportSize({ width: 360, height: 800 })
    await goto(page, `/cierre?fecha=${fecha}`)
    await expect(page.getByTestId('base-caja-fuente')).toBeVisible({ timeout: 30000 })
    await fijarBase(fecha, 60000)
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByTestId('base-caja-aviso')).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    if (process.env.SHOT_DIR) { await page.getByTestId('cierre-efectivo-esperado').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.SHOT_DIR}/base-movil.png` }) }
  })
})
