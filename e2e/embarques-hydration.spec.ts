import { test, expect, fullLogin, createEmbarque, createTrabajador, BASE, resetDatabase } from './fixtures'
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
  await fullLogin(page)
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

    // Navegar a embarques: el SSR ya pintó ambos embarques
    await page.goto(`${BASE}/embarques`)
    await expect(page.locator('[data-testid="embarque-card"]').first()).toBeVisible({ timeout: 10000 })

    // Con el bug, /api/embarques retornaría solo el de hoy y el count bajaría.
    // Con el fix, no hay request de refetch al mount, así que el count se queda en 2.
    await page.waitForTimeout(1500)
    const countAfterHydration = await page.locator('[data-testid="embarque-card"]').count()
    expect(countAfterHydration).toBe(2)

    // Regresión: el filtro "Hoy" del DateRangeFilter sigue funcionando
    await page.locator('button').filter({ hasText: /^Hoy$/ }).first().click()
    await expect(page.locator('[data-testid="embarque-card"]')).toHaveCount(1, { timeout: 10000 })
  })
})
