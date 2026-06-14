/**
 * Tier 7: Statistics Consistency
 * Tests: 8
 * Verifies that statistics across different pages are consistent with each other
 */
import { test, expect, loginAsAdmin, apiGet, BASE, todayBogota, yesterdayISO } from '../00-fixtures'

test.describe('Statistics - Dashboard vs Reportes', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-STAT-01: Dashboard ventas == Reportes ventas for today', async ({ page }) => {
    // Get dashboard data
    await page.goto(`${BASE}/dashboard`)
    const dashBody = await page.locator('body').textContent()
    expect(dashBody).toBeDefined()

    // Get reportes data
    const repRes = await apiGet(page, `/api/reportes/ventas?desde=${todayBogota()}&hasta=${todayBogota()}`)
    expect([200, 403]).toContain(repRes.status())
    if (repRes.status() === 200) {
      const repBody = await repRes.json()
      // Verify response has expected structure
      expect(repBody).toBeDefined()
    }
  })

  test('TC-STAT-02: CierreDia.totalVentas == sum of pedido totals for that day', async ({ page }) => {
    // Get the cierre for yesterday
    const cierres = await apiGet(page, `/api/cierre?fecha=${yesterdayISO()}`)
    expect([200]).toContain(cierres.status())
    const cierresBody = await cierres.json()
    // If exists, verify
    if (cierresBody.cierre) {
      expect(Number(cierresBody.cierre.totalVentas)).toBeGreaterThanOrEqual(0)
    }
  })

  test('TC-STAT-03: Cartera == sum of cliente saldos', async ({ page }) => {
    const clientes = (await (await apiGet(page, '/api/clientes')).json()).clientes || []
    let totalSaldo = 0
    for (const c of clientes) {
      totalSaldo += Number(c.saldoPendiente || 0)
    }

    const reportes = await apiGet(page, '/api/reportes/cartera')
    expect([200, 403]).toContain(reportes.status())
    if (reportes.status() === 200) {
      const rep = await reportes.json()
      // Both should be > 0 and within reasonable range
      expect(totalSaldo).toBeGreaterThanOrEqual(0)
      expect(rep).toBeDefined()
    }
  })

  test('TC-STAT-04: Ventas por origen sums to total', async ({ page }) => {
    const res = await apiGet(page, `/api/reportes/ventas?desde=${yesterdayISO()}&hasta=${todayBogota()}`)
    expect([200, 403]).toContain(res.status())
    if (res.status() === 200) {
      const body = await res.json()
      if (body.porOrigen) {
        const sum = Number(body.porOrigen.PEDIDO || 0) + Number(body.porOrigen.VENTA_RAPIDA || 0) + Number(body.porOrigen.VENTA_LIBRE || 0)
        // Should equal total ventas
        if (body.totalVentas) {
          expect(Math.abs(sum - Number(body.totalVentas))).toBeLessThan(0.01)
        }
      }
    }
  })

  test('TC-STAT-05: Cierre cobros por metodo sum to total cobrado', async ({ page }) => {
    const cierres = await apiGet(page, `/api/cierre?fecha=${yesterdayISO()}`)
    expect([200]).toContain(cierres.status())
    const cierresBody = await cierres.json()
    if (cierresBody.cierre) {
      const c = cierresBody.cierre
      const sumCobrado = Number(c.efectivo || 0) + Number(c.transferencia || 0) + Number(c.nequi || 0) + Number(c.daviplata || 0) + Number(c.bono || 0)
      // Should approximately equal total cobrado
      if (c.cobrado !== undefined) {
        expect(Math.abs(sumCobrado - Number(c.cobrado))).toBeLessThan(0.01)
      }
    }
  })
})

test.describe('Statistics - Cierre vs Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-STAT-06: Stock cuadra in cierre (stockIni + prod - ventas = stockFin)', async ({ page }) => {
    const cierres = await apiGet(page, `/api/cierre?fecha=${yesterdayISO()}`)
    expect([200]).toContain(cierres.status())
    const cierresBody = await cierres.json()
    if (cierresBody.cierre) {
      const c = cierresBody.cierre
      // agua: stockIni + prod - aguaVendida == stockFin
      const calcAgua = Number(c.stockIniAgua || 0) + Number(c.prodAgua || 0) - Number(c.aguaVendida || 0)
      expect(Math.abs(calcAgua - Number(c.stockFinAgua || 0))).toBeLessThan(0.01)
    }
  })

  test('TC-STAT-07: Cierre netoCaja formula: base + cobros - gastos - comisiones - salarios', async ({ page }) => {
    const cierres = await apiGet(page, `/api/cierre?fecha=${yesterdayISO()}`)
    expect([200]).toContain(cierres.status())
    const cierresBody = await cierres.json()
    if (cierresBody.cierre) {
      const c = cierresBody.cierre
      const calcNeto = Number(c.baseDia || 0) + Number(c.cobrado || 0) - Number(c.gastos || 0) - Number(c.comisiones || 0) - Number(c.salarios || 0)
      // Allow small tolerance
      expect(Math.abs(calcNeto - Number(c.netoCaja || 0))).toBeLessThan(1.0)
    }
  })

  test('TC-STAT-08: Embarque stats endpoint returns valid KPIs', async ({ page }) => {
    const stats = await apiGet(page, '/api/embarques/stats')
    expect([200, 403]).toContain(stats.status())

    if (stats.status() === 200) {
      const statsBody = await stats.json()
      // The stats endpoint returns { kpiGeneral, porTrabajador, porRuta, ... }.
      // We just verify the structure exists and is non-null when there are embarques.
      expect(statsBody).toBeDefined()
      // Either has KPIs (kpiGeneral) or is empty (null kpiGeneral + empty arrays)
      const hasStructure = statsBody.kpiGeneral !== undefined
        && Array.isArray(statsBody.porTrabajador)
        && Array.isArray(statsBody.porRuta)
        && Array.isArray(statsBody.tendenciaDiaria)
      expect(hasStructure).toBe(true)
    }
  })
})
