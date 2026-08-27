import { test, expect, loginAs, createEmbarque, createTrabajador, BASE, resetDatabase } from './fixtures'
import type { Page } from '@playwright/test'

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

  test('la hidratación no dispara un refetch espurio que borre los datos del SSR', async ({ page }) => {
    await embarquesLogin(page)

    // 2 embarques de HOY (el SSR de /embarques filtra a "hoy" desde 6531a68b,
    // así que el escenario de "fechas pasadas" del test original ya no aplica —
    // eso lo cubre embarques-fixes.spec.ts "Ver últimos 30 días").
    const t1 = await createTrabajador(page)
    const t2 = await createTrabajador(page)
    expect(t1.trabajador?.id).toBeTruthy()
    expect(t2.trabajador?.id).toBeTruthy()
    expect((await createEmbarque(page, t1.trabajador.id)).embarque?.id).toBeTruthy()
    expect((await createEmbarque(page, t2.trabajador.id)).embarque?.id).toBeTruthy()

    let refetchesAlMontar = 0
    page.on('request', (r) => {
      if (r.method() === 'GET' && /\/api\/embarques\?/.test(r.url())) refetchesAlMontar++
    })

    // El SSR pinta ambos; al montar NO debe haber un GET /api/embarques que
    // los reemplace (bug original: `isFirstRun` no gateaba el fetch inicial).
    await page.goto(`${BASE}/embarques`)
    await expect(page.locator('[data-testid="embarque-card"]')).toHaveCount(2, { timeout: 10000 })
    await page.waitForTimeout(1500)
    await expect(page.locator('[data-testid="embarque-card"]')).toHaveCount(2)
    expect(refetchesAlMontar).toBe(0)

    // El filtro "Hoy" del DateRangeFilter sí dispara un fetch y sigue operativo.
    await page.locator('button').filter({ hasText: /^Hoy$/ }).first().click()
    await expect(page.locator('[data-testid="embarque-card"]')).toHaveCount(2, { timeout: 10000 })
  })
})
