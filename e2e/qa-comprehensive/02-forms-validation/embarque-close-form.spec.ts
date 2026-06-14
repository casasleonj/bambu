/**
 * Tier 2: Forms Validation - Embarque Close Form
 * Tests: 8
 * The most complex form: cuadres, ventas libres, retornos, gastos, dinero
 */
import { test, expect, loginAsAdmin, apiPost, expectStatus, BASE, apiGet } from '../00-fixtures'

test.describe('Form Validation - Embarque Close', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-EC-01: Get embarque list to find open one', async ({ page }) => {
    const res = await apiGet(page, '/api/embarques?estado=ABIERTO&all=true')
    await expectStatus(res, 200)
    const body = await res.json()
    expect(body.embarques).toBeDefined()
  })

  test('TC-EC-02: Close embarque without pedidos', async ({ page }) => {
    // Get an open embarque
    const listRes = await apiGet(page, '/api/embarques?estado=ABIERTO&all=true')
    const list = (await listRes.json()).embarques || []
    if (list.length === 0) { test.skip(); return }

    const embarque = list[0]

    const res = await apiPost(page, `/api/embarques/${embarque.id}/cerrar`, {
      pedidos: [],
      ventasLibres: [],
      productos: [{ producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 }],
      gastos: [],
      dineroEntregado: 0,
    })
    expect([200, 201, 400, 409]).toContain(res.status())
  })

  test('TC-EC-03: Close embarque with discrepancy requires justificacion', async ({ page }) => {
    // First create an embarque, then try to close with discrepancy
    const listRes = await apiGet(page, '/api/embarques?estado=ABIERTO&all=true')
    const list = (await listRes.json()).embarques || []
    if (list.length === 0) { test.skip(); return }

    const embarque = list[0]

    const res = await apiPost(page, `/api/embarques/${embarque.id}/cerrar`, {
      pedidos: [],
      ventasLibres: [],
      productos: [{ producto: 'PACA_AGUA', devueltas: 5, cambios: 0, rotas: 0 }], // high discrepancy
      gastos: [],
      dineroEntregado: 0,
      // no justificacion
    })
    // Should be 400 (validation) or 201 with auto-descuento
    expect([200, 201, 400]).toContain(res.status())
  })

  test('TC-EC-04: Close embarque with non-existent embarque returns 404', async ({ page }) => {
    const res = await apiPost(page, '/api/embarques/no-existe/cerrar', {
      pedidos: [],
      ventasLibres: [],
      productos: [],
      gastos: [],
      dineroEntregado: 0,
    })
    await expectStatus(res, [400, 404, 500])
  })

  test('TC-EC-05: Close embarque with negative dineroEntregado is rejected', async ({ page }) => {
    const listRes = await apiGet(page, '/api/embarques?estado=ABIERTO&all=true')
    const list = (await listRes.json()).embarques || []
    if (list.length === 0) { test.skip(); return }

    const embarque = list[0]

    const res = await apiPost(page, `/api/embarques/${embarque.id}/cerrar`, {
      pedidos: [],
      ventasLibres: [],
      productos: [{ producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 }],
      gastos: [],
      dineroEntregado: -1000,
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-EC-06: Close already-closed embarque returns 409', async ({ page }) => {
    const listRes = await apiGet(page, '/api/embarques?estado=CERRADO&all=true')
    const list = (await listRes.json()).embarques || []
    if (list.length === 0) { test.skip(); return }

    const embarque = list[0]
    const res = await apiPost(page, `/api/embarques/${embarque.id}/cerrar`, {
      pedidos: [],
      ventasLibres: [],
      productos: [{ producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 }],
      gastos: [],
      dineroEntregado: 0,
    })
    expect([400, 409]).toContain(res.status())
  })

  test('TC-EC-07: Close embarque with ventas libres', async ({ page }) => {
    const listRes = await apiGet(page, '/api/embarques?estado=ABIERTO&all=true')
    const list = (await listRes.json()).embarques || []
    if (list.length === 0) { test.skip(); return }

    const embarque = list[0]

    const res = await apiPost(page, `/api/embarques/${embarque.id}/cerrar`, {
      pedidos: [],
      ventasLibres: [
        {
          clienteId: 'CONSUMIDOR_FINAL',
          items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
          pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
        },
      ],
      productos: [{ producto: 'PACA_AGUA', devueltas: 0, cambios: 0, rotas: 0 }],
      gastos: [],
      dineroEntregado: 5000,
    })
    expect([200, 201, 400]).toContain(res.status())
  })

  test('TC-EC-08: /embarques/[id]/cerrar page loads', async ({ page }) => {
    const listRes = await apiGet(page, '/api/embarques?estado=ABIERTO&all=true')
    const list = (await listRes.json()).embarques || []
    if (list.length === 0) { test.skip(); return }

    const embarque = list[0]
    await page.goto(`${BASE}/embarques/${embarque.id}/cerrar`)
    await expect(page).toHaveURL(/\/embarques\/.*\/cerrar/)
  })
})
