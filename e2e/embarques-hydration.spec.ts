import { test, expect, loginAs, createEmbarque, createTrabajador, BASE, resetDatabase } from './fixtures'
import { PrismaClient } from '@prisma/client'
import type { Page } from '@playwright/test'

const prisma = new PrismaClient()

async function embarquesLogin(page: Page) {
  // Evitar que el modal/banner de base caja bloquee el test.
  await page.route('**/api/config?clave=BASE_DIA_*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ config: { clave: route.request().url().split('clave=')[1], valor: '100000' } }),
    })
  })
  await loginAs(page, 'admin')
}

test.describe('Embarques — Hidratación sin refetch espurio', () => {
  test.use({ storageState: undefined })
  test.setTimeout(60000)

  test.beforeAll(() => {
    resetDatabase()
  })

  test('embarques de fechas pasadas no desaparecen tras hidratación', async ({ page }) => {
    await embarquesLogin(page)

    const trabajadorHoy = await createTrabajador(page)
    expect(trabajadorHoy.trabajador?.id).toBeTruthy()

    const trabajadorPasado = await createTrabajador(page)
    expect(trabajadorPasado.trabajador?.id).toBeTruthy()

    // 1 embarque de HOY (via API)
    const hoy = await createEmbarque(page, trabajadorHoy.trabajador.id)
    expect(hoy.embarque?.id).toBeTruthy()

    // 1 embarque de HACE 2 DÍAS (via API + backdate directo, la API no acepta fecha custom)
    const pasado = await createEmbarque(page, trabajadorPasado.trabajador.id)
    expect(pasado.embarque?.id).toBeTruthy()

    const hace2 = new Date()
    hace2.setDate(hace2.getDate() - 2)
    await prisma.embarque.update({
      where: { id: pasado.embarque.id },
      data: { fecha: hace2 },
    })

    // FIX: el SSR de /embarques está deliberadamente scopeado a "hoy"
    // (src/app/(app)/embarques/page.tsx: `where = { fecha: { gte: startOfDay,
    // lt: endOfDay } }`, comentario "FIX SSR: la vista default es hoy... para
    // coincidir con el cliente"), así que el embarque de hace 2 días NUNCA
    // aparece en el render inicial -- la premisa original de este test ("el
    // SSR ya pintó ambos embarques") ya no es cierta desde que ese default
    // se implementó. Para ver el historial hay que ampliar el rango de
    // fechas explícitamente, igual que haría un usuario real.
    await page.goto(`${BASE}/embarques`)
    await expect(page.locator('[data-testid="embarque-card"]').first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('[data-testid="embarque-card"]')).toHaveCount(1)

    const hace7 = new Date()
    hace7.setDate(hace7.getDate() - 7)
    const desdeStr = hace7.toISOString().slice(0, 10)
    const hastaStr = new Date().toISOString().slice(0, 10)
    const dateInputs = page.locator('input[type="date"]')
    await dateInputs.first().fill(desdeStr)
    await dateInputs.nth(1).fill(hastaStr)
    await expect(page.locator('[data-testid="embarque-card"]')).toHaveCount(2, { timeout: 10000 })

    // Con el bug (un efecto espurio que resetea el filtro tras montar/
    // hidratar), el count volvería a bajar solo. Con el comportamiento
    // correcto, el filtro ampliado por el usuario se mantiene estable.
    await page.waitForTimeout(1500)
    const countAfterHydration = await page.locator('[data-testid="embarque-card"]').count()
    expect(countAfterHydration).toBe(2)

    // Regresión: el filtro "Hoy" del DateRangeFilter sigue funcionando
    await page.locator('button').filter({ hasText: /^Hoy$/ }).first().click()
    await expect(page.locator('[data-testid="embarque-card"]')).toHaveCount(1, { timeout: 10000 })
  })
})
