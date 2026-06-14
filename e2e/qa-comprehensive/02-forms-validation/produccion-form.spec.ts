/**
 * Tier 2: Forms Validation - Producción Form
 * Tests: 8
 */
import { test, expect, loginAsAdmin, apiPost, expectStatus, BASE, getSellador, uniqueId, apiGet } from '../00-fixtures'

test.describe('Form Validation - Producción', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-PD-01: Create produccion with valid SELLADOR', async ({ page }) => {
    const sellador = await getSellador(page)
    if (!sellador) { test.skip(); return }

    const res = await apiPost(page, '/api/produccion', {
      trabajadorId: sellador.id,
      turno: 'MANANA',
      offlineId: uniqueId(),
      obs: 'Test produccion',
      items: [
        { producto: 'PACA_AGUA', stockIni: 100, conteoA: 50, conteoB: 50, stockFinFisico: 150, filtradas: 0, rotas: 0, consumoInterno: 0 },
        { producto: 'PACA_HIELO', stockIni: 50, conteoA: 20, conteoB: 20, stockFinFisico: 70, filtradas: 0, rotas: 0, consumoInterno: 0 },
      ],
    })
    await expectStatus(res, [200, 201, 409]) // 409 if duplicate for today
  })

  test('TC-PD-02: Produccion with non-SELLADOR is rejected', async ({ page }) => {
    // Get any worker (non-SELLADOR)
    const res = await apiGet(page, '/api/trabajadores?rol=REPARTIDOR&activo=true')
    const body = await res.json()
    const repartidor = body.trabajadores?.[0]

    if (!repartidor) { test.skip(); return }

    const r = await apiPost(page, '/api/produccion', {
      trabajadorId: repartidor.id,
      turno: 'TARDE',
      offlineId: uniqueId(),
      items: [
        { producto: 'PACA_AGUA', conteoA: 1, conteoB: 1, stockFinFisico: 1 },
        { producto: 'PACA_HIELO', conteoA: 1, conteoB: 1, stockFinFisico: 1 },
      ],
    })
    await expectStatus(r, [400, 500])
  })

  test('TC-PD-03: Produccion with empty items is rejected', async ({ page }) => {
    const sellador = await getSellador(page)
    if (!sellador) { test.skip(); return }

    const res = await apiPost(page, '/api/produccion', {
      trabajadorId: sellador.id,
      turno: 'NOCHE',
      offlineId: uniqueId(),
      items: [],
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-PD-04: Produccion with invalid producto is rejected', async ({ page }) => {
    const sellador = await getSellador(page)
    if (!sellador) { test.skip(); return }

    const res = await apiPost(page, '/api/produccion', {
      trabajadorId: sellador.id,
      turno: 'NOCHE',
      offlineId: uniqueId(),
      items: [
        { producto: 'PRODUCTO_INVALIDO', conteoA: 1, conteoB: 1, stockFinFisico: 1 },
        { producto: 'PACA_HIELO', conteoA: 1, conteoB: 1, stockFinFisico: 1 },
      ],
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-PD-05: Produccion with diferencia != 0 requires obs', async ({ page }) => {
    const sellador = await getSellador(page)
    if (!sellador) { test.skip(); return }

    // Create one with high difference
    const res = await apiPost(page, '/api/produccion', {
      trabajadorId: sellador.id,
      turno: 'NOCHE', // different shift to avoid dup
      offlineId: uniqueId(),
      items: [
        { producto: 'PACA_AGUA', stockIni: 100, conteoA: 50, conteoB: 50, stockFinFisico: 50, filtradas: 0, rotas: 0, consumoInterno: 0 }, // diff = 50
        { producto: 'PACA_HIELO', stockIni: 50, conteoA: 20, conteoB: 20, stockFinFisico: 50, filtradas: 0, rotas: 0, consumoInterno: 0 },
      ],
      // No obs!
    })
    await expectStatus(res, [400, 409])
  })

  test('TC-PD-06: Produccion dedup by offlineId', async ({ page }) => {
    const sellador = await getSellador(page)
    if (!sellador) { test.skip(); return }

    const offlineId = uniqueId()
    const body = {
      trabajadorId: sellador.id,
      turno: 'TARDE',
      offlineId,
      obs: 'Dedup test',
      items: [
        { producto: 'PACA_AGUA', stockIni: 100, conteoA: 50, conteoB: 50, stockFinFisico: 150, filtradas: 0, rotas: 0, consumoInterno: 0 },
        { producto: 'PACA_HIELO', stockIni: 50, conteoA: 20, conteoB: 20, stockFinFisico: 70, filtradas: 0, rotas: 0, consumoInterno: 0 },
      ],
    }

    const r1 = await apiPost(page, '/api/produccion', body)
    // Skip if 409 from first
    if (r1.status() === 409) { test.skip(); return }
    await expectStatus(r1, [200, 201])

    const r2 = await apiPost(page, '/api/produccion', body)
    const b2 = await r2.json()
    expect(b2.deduped).toBe(true)
  })

  test('TC-PD-07: Produccion with negative conteoA is rejected', async ({ page }) => {
    const sellador = await getSellador(page)
    if (!sellador) { test.skip(); return }

    const res = await apiPost(page, '/api/produccion', {
      trabajadorId: sellador.id,
      turno: 'NOCHE',
      offlineId: uniqueId(),
      items: [
        { producto: 'PACA_AGUA', conteoA: -5, conteoB: 1, stockFinFisico: 1 },
        { producto: 'PACA_HIELO', conteoA: 1, conteoB: 1, stockFinFisico: 1 },
      ],
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-PD-08: /produccion page loads', async ({ page }) => {
    await page.goto(`${BASE}/produccion`)
    await expect(page).toHaveURL(/\/produccion/)
    // Page should have stepper or some content
    await expect(page.locator('h1, h2, h3').first()).toBeVisible({ timeout: 5000 })
  })
})
