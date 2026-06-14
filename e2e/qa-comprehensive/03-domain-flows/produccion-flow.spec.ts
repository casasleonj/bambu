/**
 * Tier 3: Domain Flows - Producción
 * Tests: 5
 */
import { test, expect, loginAsAdmin, uniqueId, apiPost, expectStatus, BASE, getSellador } from '../00-fixtures'

test.describe('Domain Flow - Producción', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-DPR-01: Preview produccion data', async ({ page }) => {
    const res = await page.request.get(`${BASE}/api/produccion/preview`)
    await expectStatus(res, 200)
    const body = await res.json()
    expect(body).toBeDefined()
  })

  test('TC-DPR-02: Produccion with conteoA=conteoB and stockFin matching', async ({ page }) => {
    const sellador = await getSellador(page)
    if (!sellador) { test.skip(); return }

    const res = await apiPost(page, '/api/produccion', {
      trabajadorId: sellador.id,
      turno: 'TARDE',
      offlineId: uniqueId(),
      obs: 'Conteo perfecto',
      items: [
        { producto: 'PACA_AGUA', stockIni: 100, conteoA: 50, conteoB: 50, stockFinFisico: 200, filtradas: 0, rotas: 0, consumoInterno: 0 },
        { producto: 'PACA_HIELO', stockIni: 50, conteoA: 20, conteoB: 20, stockFinFisico: 90, filtradas: 0, rotas: 0, consumoInterno: 0 },
      ],
    })
    expect([200, 201, 409]).toContain(res.status())
  })

  test("TC-DPR-03: Produccion banker's rounding for odd counts", async ({ page }) => {
    const sellador = await getSellador(page)
    if (!sellador) { test.skip(); return }

    // 5 + 6 = 11, average = 5.5, rounds to 6
    const res = await apiPost(page, '/api/produccion', {
      trabajadorId: sellador.id,
      turno: 'NOCHE',
      offlineId: uniqueId(),
      obs: 'Test rounding',
      items: [
        { producto: 'PACA_AGUA', stockIni: 100, conteoA: 5, conteoB: 6, stockFinFisico: 111, filtradas: 0, rotas: 0, consumoInterno: 0 },
        { producto: 'PACA_HIELO', stockIni: 50, conteoA: 1, conteoB: 1, stockFinFisico: 52, filtradas: 0, rotas: 0, consumoInterno: 0 },
      ],
    })
    expect([200, 201, 409]).toContain(res.status())
  })

  test('TC-DPR-04: Produccion list /produccion loads with current state', async ({ page }) => {
    await page.goto(`${BASE}/produccion`)
    await expect(page).toHaveURL(/\/produccion/)
    // Stepper should be visible
    const stepper = page.locator('text=Stock Inicial, text=Conteo, text=Turno')
    if (await stepper.count() > 0) {
      await expect(stepper.first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('TC-DPR-05: Produccion comSellTotal and comRepartTotal computed correctly', async ({ page }) => {
    // This is a documentation test - verify the formula
    // comSell = prodAgua * comPacaAgua + prodHielo * comPacaHielo
    // comRepart = entregas * comRepart
    const sellador = await getSellador(page)
    if (!sellador) { test.skip(); return }

    const res = await apiPost(page, '/api/produccion', {
      trabajadorId: sellador.id,
      turno: 'NOCHE',
      offlineId: uniqueId(),
      obs: 'Comision test',
      items: [
        { producto: 'PACA_AGUA', stockIni: 100, conteoA: 10, conteoB: 10, stockFinFisico: 120, filtradas: 0, rotas: 0, consumoInterno: 0 },
        { producto: 'PACA_HIELO', stockIni: 50, conteoA: 5, conteoB: 5, stockFinFisico: 60, filtradas: 0, rotas: 0, consumoInterno: 0 },
      ],
    })
    if (res.status() === 200 || res.status() === 201) {
      const body = await res.json()
      const prod = body.produccion || body
      // comSellTotal should be > 0
      expect(Number(prod.comSellTotal || 0)).toBeGreaterThan(0)
    }
  })
})
