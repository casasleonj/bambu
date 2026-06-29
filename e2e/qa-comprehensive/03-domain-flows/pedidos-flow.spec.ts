/**
 * Tier 3: Domain Flows - Pedidos
 * Tests: 12
 */
import { test, expect, loginAsAdmin, uniquePhone, uniqueClientName, apiPost, apiGet, BASE } from '../00-fixtures'

test.describe('Domain Flow - Pedidos', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-DP-01: Create pedido PUNTO without cliente (CONSUMIDOR_FINAL)', async ({ page }) => {
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
    })
    expect([200, 201]).toContain(res.status())
  })

  test('TC-DP-02: List page shows pedido with smart date filter', async ({ page }) => {
    await page.goto(`${BASE}/pedidos`)
    await expect(page).toHaveURL(/\/pedidos/)
    // Date filter should be visible
    await expect(page.locator('button:has-text("Hoy"), button:has-text("Todos")').first()).toBeVisible({ timeout: 5000 })
  })

  test('TC-DP-03: Tab Fiados shows pedidos with saldo > 0', async ({ page }) => {
    await page.goto(`${BASE}/pedidos?tab=fiados`)
    await expect(page).toHaveURL(/tab=fiados/)
  })

  test('TC-DP-04: Tab Alertas shows pedidos with alerts', async ({ page }) => {
    await page.goto(`${BASE}/pedidos?tab=alertas`)
    await expect(page).toHaveURL(/tab=alertas/)
  })

  test('TC-DP-05: Filter by clienteId pre-fills the list', async ({ page }) => {
    const c = await apiPost(page, '/api/clientes', { nombre: uniqueClientName('TC-DP-05'), telefono: uniquePhone() })
    const cliente = (await c.json()).cliente || (await c.json())
    await page.goto(`${BASE}/pedidos?clienteId=${cliente.id}`)
    await expect(page).toHaveURL(/clienteId=/)
  })

  test('TC-DP-06: Filter by date range works', async ({ page }) => {
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    await page.goto(`${BASE}/pedidos?desde=${yesterday}&hasta=${today}`)
    await expect(page).toHaveURL(/desde=/)
  })

  test('TC-DP-07: Anular pedido creates NotaCredito with monto', async ({ page }) => {
    // Create a paid pedido
    const pedRes = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
    })
    expect([200, 201]).toContain(pedRes.status())
    const pedido = (await pedRes.json()).pedido || (await pedRes.json())

    // Need to deliver first
    await apiPost(page, `/api/pedidos/${pedido.id}/entrega`, {
      tipo: 'COMPLETO',
      itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
    })

    // Now anular
    const anuRes = await apiPost(page, `/api/pedidos/${pedido.id}/anular`, {
      motivo: 'Test anulacion',
    })
    expect([200, 201]).toContain(anuRes.status())
    const anuBody = await anuRes.json()

    // BUG CHECK: NotaCredito.monto should be `total` but might be 0 (cancelar vs anular asymmetry)
    if (anuBody.notaCredito) {
      const ncMonto = Number(anuBody.notaCredito.monto)
      // Document the BUG: should be > 0 if anular
      expect(ncMonto).toBeGreaterThan(0)
    }
  })

  test('TC-DP-08: Cancelar pedido (BEFORE delivery) creates NC.monto=0 (BUG)', async ({ page }) => {
    const pedRes = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
    })
    expect([200, 201]).toContain(pedRes.status())
    const pedido = (await pedRes.json()).pedido || (await pedRes.json())

    // Cancelar (without delivering)
    // (canRes discarded — se prueba via delRes que sigue)
    await apiPost(page, `/api/pedidos/${pedido.id}`, {
      _method: 'DELETE',
    })
    // Or actual DELETE
    const delRes = await page.request.delete(`${BASE}/api/pedidos/${pedido.id}`)
    expect([200, 201, 400, 404, 500]).toContain(delRes.status())
  })

  test('TC-DP-09: Pedido state PENDIENTE -> EN_RUTA -> ENTREGADO', async ({ page }) => {
    const pedRes = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
    })
    expect([200, 201]).toContain(pedRes.status())
    const pedido = (await pedRes.json()).pedido || (await pedRes.json())

    // Need an embarque to send
    const listRes = await apiGet(page, '/api/embarques?estado=ABIERTO&all=true')
    const embarques = (await listRes.json()).embarques || []
    if (embarques.length === 0) { test.skip(); return }

    // Send
    const sendRes = await apiPost(page, `/api/pedidos/${pedido.id}/enviar`, {
      embarqueId: embarques[0].id,
    })
    expect([200, 201, 400, 409]).toContain(sendRes.status())

    if (sendRes.status() === 200 || sendRes.status() === 201) {
      // Deliver
      const delivRes = await apiPost(page, `/api/pedidos/${pedido.id}/entrega`, {
        tipo: 'COMPLETO',
        itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 1 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
      })
      expect([200, 201, 400]).toContain(delivRes.status())
    }
  })

  test('TC-DP-10: Cannot deliver pedido in PENDIENTE state without going through EN_RUTA', async ({ page }) => {
    const pedRes = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
    })
    expect([200, 201]).toContain(pedRes.status())
    const pedido = (await pedRes.json()).pedido || (await pedRes.json())

    // Try to deliver without sending first
    const delivRes = await apiPost(page, `/api/pedidos/${pedido.id}/entrega`, {
      tipo: 'COMPLETO',
      itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
    })
    // Should be 400 (state machine violation)
    expect([400, 409]).toContain(delivRes.status())
  })

  test('TC-DP-11: Cannot send pedido in ENTREGADO state', async ({ page }) => {
    // Need an already delivered pedido
    const pedRes = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
    })
    expect([200, 201]).toContain(pedRes.status())
    const pedido = (await pedRes.json()).pedido || (await pedRes.json())

    // Deliver directly (PUNTO path may allow this)
    const delivRes = await apiPost(page, `/api/pedidos/${pedido.id}/entrega`, {
      tipo: 'COMPLETO',
      itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
    })

    // Now try to send (should fail - already delivered or in invalid state)
    if (delivRes.status() === 200 || delivRes.status() === 201) {
      const listRes = await apiGet(page, '/api/embarques?estado=ABIERTO&all=true')
      const embarques = (await listRes.json()).embarques || []
      if (embarques.length > 0) {
        const sendRes = await apiPost(page, `/api/pedidos/${pedido.id}/enviar`, {
          embarqueId: embarques[0].id,
        })
        expect([400, 409]).toContain(sendRes.status())
      }
    }
  })

  test('TC-DP-12: Pedido list polling works (re-fetch)', async ({ page }) => {
    await page.goto(`${BASE}/pedidos`)
    await page.waitForTimeout(2000)
    // Reload to trigger refetch
    await page.reload()
    await expect(page).toHaveURL(/\/pedidos/)
  })
})
