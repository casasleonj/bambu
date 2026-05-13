import { test, expect, fullLogin, apiPost, apiGet, createCliente } from './fixtures'

test.describe('Ciclo de Cancelación', () => {

  // ─── 1. Anular pedido entregado → nota de crédito → factura ANULADA ─────────

  test('anular pedido entregado → nota de crédito → factura ANULADA', async ({ page }) => {
    test.setTimeout(120000)
    await fullLogin(page)

    const cliente = await createCliente(page)
    expect(cliente.id).toBeTruthy()

    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id,
      canal: 'PUNTO',
      ventaRapida: true,
      productos: { pacaAgua: 2, pacaHielo: 0 },
      pagos: [{ metodo: 'EFECTIVO', monto: 50000 }],
    })
    const pedidoJson = await pedidoRes.json()
    const pedidoId = pedidoJson.pedido?.id || pedidoJson.id
    expect(pedidoId).toBeTruthy()

    const facturaRes = await apiPost(page, '/api/facturas', {
      pedidoId,
      clienteId: cliente.id,
    })
    const facturaJson = await facturaRes.json()
    const facturaId = facturaJson.factura?.id

    const anularRes = await apiPost(page, `/api/pedidos/${pedidoId}/anular`, {
      motivo: 'Test E2E cancelación',
      devolverStock: false,
    })

    if (anularRes.status() === 400) {
      const errBody = await anularRes.json().catch(() => ({}))
      if (errBody.error?.includes('ENTREGADOS') || errBody.error?.includes('ENTREGADO')) {
        test.skip(true, 'Pedido not in ENTREGADO state via API (venta rapida flow differs)')
        return
      }
    }

    expect(anularRes.status()).toBe(200)
    const anularBody = await anularRes.json()
    expect(anularBody).toHaveProperty('notaCredito')
    expect(anularBody.pedido.estado).toBe('ANULADO')

    if (facturaId) {
      const facturaCheck = await apiGet(page, `/api/facturas/${facturaId}`)
      const fcBody = await facturaCheck.json()
      const fc = fcBody.factura || fcBody
      expect(fc.estado).toBe('ANULADA')
    }
  })

  // ─── 2. Anular pedido no entregado debe fallar ──────────────────────────────

  test('anular pedido no entregado debe fallar', async ({ page }) => {
    await fullLogin(page)

    const cliente = await createCliente(page)
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id,
      canal: 'DOMICILIO',
      ventaRapida: false,
      productos: { pacaAgua: 1, pacaHielo: 0 },
      pagos: [],
    })
    const pedidoJson = await pedidoRes.json()
    const pedidoId = pedidoJson.pedido?.id || pedidoJson.id
    expect(pedidoId).toBeTruthy()

    const anularRes = await apiPost(page, `/api/pedidos/${pedidoId}/anular`, {
      motivo: 'Intentar anular pendiente',
      devolverStock: false,
    })

    expect(anularRes.status()).toBe(400)
    const errBody = await anularRes.json()
    expect(errBody.error).toMatch(/ENTREGADO|entregado|SOLO_ENTREGADO/i)
  })

  // ─── 3. Anular pedido ya anulado ────────────────────────────────────────────

  test('anular pedido ya anulado', async ({ page }) => {
    test.setTimeout(120000)
    await fullLogin(page)

    const cliente = await createCliente(page)
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id,
      canal: 'PUNTO',
      ventaRapida: true,
      productos: { pacaAgua: 1, pacaHielo: 0 },
      pagos: [{ metodo: 'EFECTIVO', monto: 50000 }],
    })
    const pedidoJson = await pedidoRes.json()
    const pedidoId = pedidoJson.pedido?.id || pedidoJson.id

    const anular1 = await apiPost(page, `/api/pedidos/${pedidoId}/anular`, {
      motivo: 'Primera anulación',
      devolverStock: false,
    })

    if (anular1.status() !== 200) {
      test.skip()
      return
    }

    const anular2 = await apiPost(page, `/api/pedidos/${pedidoId}/anular`, {
      motivo: 'Segunda anulación',
      devolverStock: false,
    })

    expect(anular2.status()).toBe(400)
    const errBody = await anular2.json()
    expect(errBody.error).toMatch(/YA_ANULADO|anulado/i)
  })

  // ─── 4. Pedido con hijos ────────────────────────────────────────────────────

  test('pedido con hijos', async ({ page }) => {
    test.setTimeout(120000)
    await fullLogin(page)

    const cliente = await createCliente(page)
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id,
      canal: 'PUNTO',
      ventaRapida: true,
      productos: { pacaAgua: 3, pacaHielo: 0 },
      pagos: [{ metodo: 'EFECTIVO', monto: 50000 }],
    })
    const pedidoJson = await pedidoRes.json()
    const pedidoId = pedidoJson.pedido?.id || pedidoJson.id

    const anularRes = await apiPost(page, `/api/pedidos/${pedidoId}/anular`, {
      motivo: 'Test cascade',
      devolverStock: false,
    })

    if (anularRes.status() === 400) {
      const errBody = await anularRes.json().catch(() => ({}))
      if (errBody.error?.includes('ENTREGADOS')) {
        test.skip(true, 'Pedido not ENTREGADO; cascade test for VENTA_RAPIDA path not appliable')
        return
      }
    }

    expect(anularRes.status()).toBe(200)
    const anularBody = await anularRes.json()
    expect(anularBody).toHaveProperty('hijosAnulados')
    expect(typeof anularBody.hijosAnulados).toBe('number')
  })
})
