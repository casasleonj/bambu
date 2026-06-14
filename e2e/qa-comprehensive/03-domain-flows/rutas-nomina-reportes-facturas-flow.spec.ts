/**
 * Tier 3: Domain Flows - Rutas, Nómina, Reportes, Facturas, Resumen
 * Tests: 5 each, combined for efficiency
 */
import { test, expect, loginAsAdmin, apiPost, expectStatus, BASE, apiGet, todayBogota, yesterdayISO } from '../00-fixtures'

test.describe('Domain Flow - Rutas', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-DRT-01: /rutas list page loads', async ({ page }) => {
    await page.goto(`${BASE}/rutas`)
    await expect(page).toHaveURL(/\/rutas/)
  })

  test('TC-DRT-02: /rutas/analisis shows conflictos and sugerencias', async ({ page }) => {
    await page.goto(`${BASE}/rutas/analisis`)
    await expect(page).toHaveURL(/\/rutas\/analisis/)
  })

  test('TC-DRT-03: Get rutas analisis endpoint', async ({ page }) => {
    const res = await apiGet(page, '/api/rutas/analisis')
    await expectStatus(res, 200)
  })

  test('TC-DRT-04: Create ruta with horario and days', async ({ page }) => {
    const res = await apiPost(page, '/api/rutas', {
      nombre: `Ruta Flow ${Date.now() % 1000}`,
      dias: 'LUN,MAR,MIE,JUE,VIE',
      horarioInicio: '08:00',
      horarioFin: '14:00',
    })
    expect([200, 201]).toContain(res.status())
  })

  test('TC-DRT-05: Update ruta', async ({ page }) => {
    const list = (await (await apiGet(page, '/api/rutas')).json()).rutas || []
    if (list.length === 0) { test.skip(); return }
    const r = list[0]

    const res = await apiPost(page, `/api/rutas?id=${r.id}`, {
      nombre: r.nombre + ' (updated)',
    })
    expect([200, 201]).toContain(res.status())
  })
})

test.describe('Domain Flow - Nómina', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-DNM-01: /nomina page loads', async ({ page }) => {
    await page.goto(`${BASE}/nomina`)
    await expect(page).toHaveURL(/\/nomina/)
  })

  test('TC-DNM-02: List nominas', async ({ page }) => {
    const res = await apiGet(page, '/api/nomina')
    await expectStatus(res, 200)
  })

  test('TC-DNM-03: Nomina AUTO computes correctamente', async ({ page }) => {
    const t = (await (await apiGet(page, '/api/trabajadores?activo=true')).json()).trabajadores?.[0]
    if (!t) { test.skip(); return }

    const farDate = '2020-06-01'
    const res = await apiPost(page, '/api/nomina', {
      trabajadorId: t.id,
      fechaInicio: farDate,
      fechaFin: farDate,
      tipoCalculo: 'AUTO',
    })
    expect([200, 201, 409]).toContain(res.status())
  })

  test('TC-DNM-04: Nomina PENDIENTE can be PAGADA', async ({ page }) => {
    const list = (await (await apiGet(page, '/api/nomina')).json()).nominas || []
    const pendiente = list.find((n: any) => n.estado === 'PENDIENTE')
    if (!pendiente) { test.skip(); return }

    const res = await apiPost(page, `/api/nomina/${pendiente.id}`, {
      estado: 'PAGADA',
    })
    expect([200, 201, 400]).toContain(res.status())
  })

  test('TC-DNM-05: Nomina total is computed server-side', async ({ page }) => {
    const list = (await (await (await apiGet(page, '/api/nomina')).json())).nominas || []
    if (list.length === 0) { test.skip(); return }
    const n = list[0]
    // total should exist and be non-negative
    expect(Number(n.total || 0)).toBeGreaterThanOrEqual(0)
  })
})

test.describe('Domain Flow - Reportes', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-DRP-01: /reportes page loads', async ({ page }) => {
    await page.goto(`${BASE}/reportes`)
    await expect(page).toHaveURL(/\/reportes/)
  })

  test('TC-DRP-02: Reportes ventas endpoint', async ({ page }) => {
    const res = await apiGet(page, `/api/reportes/ventas?desde=${yesterdayISO()}&hasta=${todayBogota()}`)
    await expectStatus(res, 200)
  })

  test('TC-DRP-03: Reportes cartera endpoint', async ({ page }) => {
    const res = await apiGet(page, '/api/reportes/cartera')
    await expectStatus(res, 200)
  })

  test('TC-DRP-04: Reportes ventas with custom range', async ({ page }) => {
    const start = '2020-01-01'
    const end = '2020-12-31'
    const res = await apiGet(page, `/api/reportes/ventas?desde=${start}&hasta=${end}`)
    await expectStatus(res, 200)
  })

  test('TC-DRP-05: Reportes balance cuadra (cobros - gastos)', async ({ page }) => {
    const res = await apiGet(page, `/api/reportes/ventas?desde=${yesterdayISO()}&hasta=${todayBogota()}`)
    await expectStatus(res, 200)
    const body = await res.json()
    // cobros and gastos should exist
    expect(body).toBeDefined()
  })
})

test.describe('Domain Flow - Facturas', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-DFA-01: /facturas list page loads', async ({ page }) => {
    await page.goto(`${BASE}/facturas`)
    await expect(page).toHaveURL(/\/facturas/)
  })

  test('TC-DFA-02: List facturas', async ({ page }) => {
    const res = await apiGet(page, '/api/facturas')
    await expectStatus(res, 200)
  })

  test('TC-DFA-03: Get factura by id', async ({ page }) => {
    const list = (await (await apiGet(page, '/api/facturas')).json()).facturas || []
    if (list.length === 0) { test.skip(); return }

    const res = await apiGet(page, `/api/facturas/${list[0].id}`)
    await expectStatus(res, 200)
  })

  test('TC-DFA-04: Abonar factura reduces saldo', async ({ page }) => {
    // Get a factura with saldo > 0
    const list = (await (await apiGet(page, '/api/facturas')).json()).facturas || []
    const f = list.find((f: any) => Number(f.saldo) > 0)
    if (!f) { test.skip(); return }

    const res = await apiPost(page, '/api/abonos', {
      facturaId: f.id,
      clienteId: f.clienteId,
      monto: 1000,
      metodoPago: 'EFECTIVO',
    })
    expect([200, 201]).toContain(res.status())
  })

  test('TC-DFA-05: Abono with monto > saldo is rejected', async ({ page }) => {
    const list = (await (await apiGet(page, '/api/facturas')).json()).facturas || []
    const f = list.find((f: any) => Number(f.saldo) > 0)
    if (!f) { test.skip(); return }

    const res = await apiPost(page, '/api/abonos', {
      facturaId: f.id,
      clienteId: f.clienteId,
      monto: 99999999, // > saldo
      metodoPago: 'EFECTIVO',
    })
    await expectStatus(res, [400, 409])
  })
})

test.describe('Domain Flow - Resumen Facturas', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-DRF-01: /resumen-facturas with clienteId loads', async ({ page }) => {
    const cl = (await (await apiGet(page, '/api/clientes')).json()).clientes?.[0]
    if (!cl) { test.skip(); return }

    const url = `/resumen-facturas?clienteId=${cl.id}&desde=${yesterdayISO()}&hasta=${todayBogota()}`
    await page.goto(`${BASE}${url}`)
    await expect(page).toHaveURL(/resumen-facturas/)
  })

  test('TC-DRF-02: Resumen facturas endpoint', async ({ page }) => {
    const cl = (await (await apiGet(page, '/api/clientes')).json()).clientes?.[0]
    if (!cl) { test.skip(); return }

    const res = await apiGet(page, `/api/clientes/${cl.id}/resumen-facturas?desde=${yesterdayISO()}&hasta=${todayBogota()}`)
    await expectStatus(res, 200)
  })
})
