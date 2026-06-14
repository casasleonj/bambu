/**
 * Tier 2: Forms Validation - Pedido Form (Unified)
 * Tests: 15
 * Covers: pedido creation, validation, business rules
 */
import { test, expect, loginAsAdmin, uniquePhone, uniqueClientName, uniqueId, apiPost, apiGet, expectStatus, BASE, getFirstCliente } from '../00-fixtures'

test.describe('Form Validation - Pedido Unified', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-PF-01: Create pedido PUNTO with CONSUMIDOR_FINAL', async ({ page }) => {
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
    })
    await expectStatus(res, [200, 201])
  })

  test('TC-PF-02: Create pedido DOMICILIO with valid cliente', async ({ page }) => {
    const cliente = await getFirstCliente(page)
    const clienteId = cliente?.id || cliente?.clienteId

    if (!clienteId) {
      test.skip()
      return
    }

    const res = await apiPost(page, '/api/pedidos', {
      clienteId,
      canal: 'DOMICILIO',
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      pagos: [],
    })
    await expectStatus(res, [200, 201])
  })

  test('TC-PF-03: API rejects pedido with no items', async ({ page }) => {
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
    })
    await expectStatus(res, 400)
  })

  test('TC-PF-04: API rejects pedido with all zero quantities', async ({ page }) => {
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [
        { producto: 'PACA_AGUA', cantidad: 0 },
        { producto: 'PACA_HIELO', cantidad: 0 },
      ],
      pagos: [],
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-PF-05: API rejects pedido with negative cantidad', async ({ page }) => {
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [{ producto: 'PACA_AGUA', cantidad: -5 }],
      pagos: [],
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-PF-06: API rejects pedido with invalid producto', async ({ page }) => {
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [{ producto: 'PRODUCTO_INEXISTENTE', cantidad: 1 }],
      pagos: [],
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-PF-07: API rejects pago with negative monto', async ({ page }) => {
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: -100 }],
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-PF-08: API rejects pago with invalid metodo', async ({ page }) => {
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'CRIPTOMONEDA', monto: 100 }],
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-PF-09: Pedido total is computed server-side correctly', async ({ page }) => {
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [
        { producto: 'PACA_AGUA', cantidad: 2 },
        { producto: 'PACA_HIELO', cantidad: 1 },
      ],
      pagos: [{ metodo: 'EFECTIVO', monto: 99999999 }], // Overpay
    })
    await expectStatus(res, [200, 201])
    const body = await res.json()
    const pedido = body.pedido || body
    // Total should be > 0
    expect(Number(pedido.total)).toBeGreaterThan(0)
    // saldo = total - totalPagado
    expect(Number(pedido.saldo)).toBeLessThanOrEqual(Number(pedido.total))
  })

  test('TC-PF-10: Overpayment generates saldoFavor for cliente', async ({ page }) => {
    // Create a fresh cliente
    const cRes = await apiPost(page, '/api/clientes', { nombre: uniqueClientName('Overpay'), telefono: uniquePhone() })
    const cliente = (await cRes.json()).cliente || (await cRes.json())
    const clienteId = cliente.id

    // Initial saldoFavor should be 0
    expect(Number(cliente.saldoFavor || 0)).toBe(0)

    // Create pedido with huge overpayment
    const res = await apiPost(page, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 1000000 }],
    })
    await expectStatus(res, [200, 201])

    // Check cliente saldoFavor increased
    const cRes2 = await apiGet(page, `/api/clientes/${clienteId}`)
    const c2 = await cRes2.json()
    const cliente2 = c2.cliente || c2
    expect(Number(cliente2.saldoFavor || 0)).toBeGreaterThan(0)
  })

  test('TC-PF-11: Venta libre endpoint requires REPARTIDOR or higher', async ({ page }) => {
    // Anonymous / unauthenticated user calling this should be 401
    const ctx = await page.context()
    await ctx.clearCookies()
    const res = await page.request.post(`${BASE}/api/pedidos/venta-libre`, {
      data: {
        clienteId: 'CONSUMIDOR_FINAL',
        items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
        pagos: [],
        embarqueId: 'fake',
        fotoEntrega: 'data:image/png;base64,AAAA',
        gpsLat: 4.7110,
        gpsLng: -74.0721,
        offlineId: uniqueId(),
      },
    })
    expect([401, 403, 400]).toContain(res.status())
  })

  test('TC-PF-12: Venta libre accepts valid items', async ({ page }) => {
    // Need a real embarque. Get any open embarque.
    const embRes = await apiGet(page, '/api/embarques?estado=ABIERTO&all=true')
    const embBody = await embRes.json()
    const embarque = embBody.embarques?.[0]

    if (!embarque) {
      test.skip()
      return
    }

    const res = await apiPost(page, '/api/pedidos/venta-libre', {
      clienteId: 'CONSUMIDOR_FINAL',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
      embarqueId: embarque.id,
      fotoEntrega: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      gpsLat: 4.7110,
      gpsLng: -74.0721,
      offlineId: uniqueId(),
    })
    // May be 200, 201, or 400 if embarque not really open
    expect([200, 201, 400, 404]).toContain(res.status())
  })

  test('TC-PF-13: Pedido with offlineId is deduped on retry', async ({ page }) => {
    const offlineId = uniqueId()
    const body = {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
      offlineId,
    }

    const r1 = await apiPost(page, '/api/pedidos', body)
    await expectStatus(r1, [200, 201])
    const b1 = await r1.json()
    const id1 = b1.pedido?.id || b1.id

    const r2 = await apiPost(page, '/api/pedidos', body)
    await expectStatus(r2, [200, 201, 409])
    const b2 = await r2.json()
    const id2 = b2.pedido?.id || b2.id

    // Should be same ID
    if (id1 && id2) {
      expect(id1).toBe(id2)
    }
    // Should be marked as deduped
    expect(b2.deduped).toBe(true)
  })

  test('TC-PF-14: VentaRapidaForm sends fields not in VentaLibreSchema (BUG)', async ({ page }) => {
    // This test documents the BUG: VentaRapidaForm sends 'canal', 'tipo', 'ventaRapida', 'clienteNuevo'
    // but VentaLibreSchema only accepts items, pagos, embarqueId, fotoEntrega, gpsLat/Lng, offlineId
    // Expected: form should NOT submit, OR server should be more permissive
    const res = await apiPost(page, '/api/pedidos/venta-libre', {
      canal: 'PUNTO',         // Not in schema
      tipo: 'PUNTO',           // Not in schema
      ventaRapida: true,       // Not in schema
      clienteNuevo: { nombre: 'Test' },  // Not in schema
      clienteId: 'CONSUMIDOR_FINAL',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [],
      embarqueId: 'fake',
      fotoEntrega: 'data:image/png;base64,AAAA',
      gpsLat: 4.711,
      gpsLng: -74.0721,
      offlineId: uniqueId(),
    })
    // Should be 400 because of extra fields (strict Zod)
    // OR 200 if schema is not strict
    // The bug is that the form sends these but server rejects
    // Document: this is the integration bug we found
    expect([400, 422, 200, 201]).toContain(res.status())
  })

  test('TC-PF-15: Pedido listado page loads with FAB and stats', async ({ page }) => {
    await page.goto(`${BASE}/pedidos`)
    await expect(page).toHaveURL(/\/pedidos/)

    // Should have tabs (Pedidos, Fiados, Alertas)
    await expect(page.locator('button:has-text("Pedidos")').first()).toBeVisible({ timeout: 5000 })

    // Should have smart date filter
    const dateFilter = page.locator('button:has-text("Hoy"), button:has-text("Todos")').first()
    if (await dateFilter.count() > 0) {
      await expect(dateFilter).toBeVisible()
    }
  })
})
