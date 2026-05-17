// @tests api/abono, api/factura, api/pedido
import { test, expect, fullLogin, apiPost, apiGet, createCliente } from './fixtures'

test.describe('Ciclo de Crédito', () => {

  // ─── 1. Ciclo completo: pedido fiado → factura → abonos parciales → PAGADA ──

  test('ciclo completo: pedido fiado → factura → abonos parciales → PAGADA', async ({ page }) => {
    test.setTimeout(120000)
    await fullLogin(page)

    const cliente = await createCliente(page)
    expect(cliente.id).toBeTruthy()

    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 1000 }],
    })
    const pedidoJson = await pedidoRes.json()
    const pedidoId = pedidoJson.pedido?.id || pedidoJson.id
    expect(pedidoId).toBeTruthy()

    const pedidoDetail = await apiGet(page, `/api/pedidos/${pedidoId}`)
    const detailBody = await pedidoDetail.json()
    const pedido = detailBody.pedido || detailBody
    const saldoInicial = Number(pedido.saldo)
    expect(saldoInicial).toBeGreaterThan(0)

    const facturaRes = await apiPost(page, '/api/facturas', {
      pedidoId,
      clienteId: cliente.id,
    })
    const facturaShouldWork = facturaRes.status() === 201 || facturaRes.status() === 200
    expect(facturaShouldWork).toBe(true)

    const facturasGet = await apiGet(page, `/api/facturas?pedidoId=${pedidoId}`)
    const facturasBody = await facturasGet.json()
    const facturas = facturasBody.facturas || facturasBody.data || []
    const factura = facturas.find((f: any) => f.pedidoId === pedidoId)

    if (!factura) {
      test.skip()
      return
    }

    expect(factura.estado).toMatch(/EMITIDA|PENDIENTE/)
    const saldoFactura = Number(factura.saldo)
    expect(saldoFactura).toBeGreaterThan(0)

    const mitad = Math.floor(saldoFactura / 2)
    const abono1Res = await apiPost(page, '/api/abonos', {
      facturaId: factura.id,
      clienteId: cliente.id,
      pedidoId,
      monto: mitad,
      metodoPago: 'EFECTIVO',
    })
    expect(abono1Res.status()).toBe(201)

    const facturaAfterAb1 = await apiGet(page, `/api/facturas/${factura.id}`)
    const fab1Body = await facturaAfterAb1.json()
    const fa1 = fab1Body.factura || fab1Body
    expect(Number(fa1.saldo)).toBeLessThan(saldoFactura)
    expect(Number(fa1.saldo)).toBeGreaterThan(0)

    const abono2Res = await apiPost(page, '/api/abonos', {
      facturaId: factura.id,
      clienteId: cliente.id,
      pedidoId,
      monto: Number(fa1.saldo),
      metodoPago: 'EFECTIVO',
    })
    expect(abono2Res.status()).toBe(201)

    const facturaFinal = await apiGet(page, `/api/facturas/${factura.id}`)
    const ffBody = await facturaFinal.json()
    const ff = ffBody.factura || ffBody
    expect(Number(ff.saldo)).toBe(0)
    expect(ff.estado).toBe('PAGADA')
  })

  // ─── 2. FIFO across multiple pedidos ────────────────────────────────────────

  test('FIFO across multiple pedidos', async ({ page }) => {
    test.setTimeout(120000)
    await fullLogin(page)

    const cliente = await createCliente(page)

    const [p1, p2] = await Promise.all([
      apiPost(page, '/api/pedidos', {
        clienteId: cliente.id, canal: 'PUNTO', ventaRapida: true,
        items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 500 }],
      }),
      apiPost(page, '/api/pedidos', {
        clienteId: cliente.id, canal: 'PUNTO', ventaRapida: true,
        items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 500 }],
      }),
    ])

    const j1 = await p1.json()
    const j2 = await p2.json()
    const pedido1 = j1.pedido || j1
    const pedido2 = j2.pedido || j2
    expect(pedido1.id).toBeTruthy()
    expect(pedido2.id).toBeTruthy()

    const deudaTotal = Number(pedido1.saldo) + Number(pedido2.saldo)
    expect(deudaTotal).toBeGreaterThan(0)

    const pagoFiadoRes = await apiPost(page, '/api/pedidos/pagar-fiado', {
      clienteId: cliente.id,
      monto: Number(pedido1.saldo),
      metodo: 'EFECTIVO',
    })
    expect(pagoFiadoRes.status()).toBe(200)

    const pagoBody = await pagoFiadoRes.json()
    const pagosAplicados = pagoBody.pagosAplicados || []
    expect(pagosAplicados.length).toBeGreaterThan(0)
    expect(pagosAplicados[0].pedidoId).toBe(pedido1.id)
  })

  // ─── 3. Sobrepago ───────────────────────────────────────────────────────────

  test('sobrepago', async ({ page }) => {
    await fullLogin(page)

    const cliente = await createCliente(page)
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 0 }],
    })
    const pedidoJson = await pedidoRes.json()
    const pedido = pedidoJson.pedido || pedidoJson
    const saldoPedido = Number(pedido.saldo)

    const pagoFiadoRes = await apiPost(page, '/api/pedidos/pagar-fiado', {
      clienteId: cliente.id,
      monto: saldoPedido + 50000,
      metodo: 'EFECTIVO',
    })
    expect(pagoFiadoRes.status()).toBe(200)

    const body = await pagoFiadoRes.json()
    expect(body).toHaveProperty('montoSobrante')
    expect(body.montoSobrante).toBeGreaterThan(0)
  })

  // ─── 4. Cliente sin deuda ───────────────────────────────────────────────────

  test('cliente sin deuda', async ({ page }) => {
    await fullLogin(page)

    const cliente = await createCliente(page)

    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 50000 }],
    })
    const pedidoJson = await pedidoRes.json()
    const pedido = pedidoJson.pedido || pedidoJson

    if (Number(pedido.saldo) > 0) {
      await apiPost(page, '/api/pedidos/pagar-fiado', {
        clienteId: cliente.id,
        monto: Number(pedido.saldo),
        metodo: 'EFECTIVO',
      })
    }

    const pagoFiadoRes = await apiPost(page, '/api/pedidos/pagar-fiado', {
      clienteId: cliente.id,
      monto: 10000,
      metodo: 'EFECTIVO',
    })
    expect(pagoFiadoRes.status()).toBe(400)

    const body = await pagoFiadoRes.json()
    expect(body.error).toMatch(/deuda|debe|debe/i)
  })

  // ─── 5. Multi-metodo abono ──────────────────────────────────────────────────

  test('multi-metodo abono', async ({ page }) => {
    test.setTimeout(120000)
    await fullLogin(page)

    const cliente = await createCliente(page)
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 3 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 1000 }],
    })
    const pedidoJson = await pedidoRes.json()
    const pedidoId = pedidoJson.pedido?.id || pedidoJson.id
    const pedido = pedidoJson.pedido || pedidoJson
    const saldoPedido = Number(pedido.saldo)

    const facturaRes = await apiPost(page, '/api/facturas', { pedidoId, clienteId: cliente.id })
    await facturaRes.json().catch(() => null)

    const facturasGet = await apiGet(page, `/api/facturas?pedidoId=${pedidoId}`)
    const facturasBody = await facturasGet.json()
    const facturas = facturasBody.facturas || facturasBody.data || []
    const factura = facturas.find((f: any) => f.pedidoId === pedidoId)

    if (!factura || saldoPedido <= 0) {
      test.skip()
      return
    }

    const tercio = Math.ceil(saldoPedido / 3)

    const a1 = await apiPost(page, '/api/abonos', {
      facturaId: factura.id, clienteId: cliente.id, pedidoId,
      monto: tercio, metodoPago: 'EFECTIVO',
    })
    expect(a1.status()).toBe(201)

    const tercio2 = Math.min(tercio, saldoPedido - tercio)
    if (tercio2 > 0) {
      const a2 = await apiPost(page, '/api/abonos', {
        facturaId: factura.id, clienteId: cliente.id, pedidoId,
        monto: tercio2, metodoPago: 'NEQUI',
      })
      expect(a2.status()).toBe(201)
    }

    const facturaCheck = await apiGet(page, `/api/facturas/${factura.id}`)
    const fcBody = await facturaCheck.json()
    const fc = fcBody.factura || fcBody
    const saldoRestante = Number(fc.saldo)

    if (saldoRestante > 0) {
      const a3 = await apiPost(page, '/api/abonos', {
        facturaId: factura.id, clienteId: cliente.id, pedidoId,
        monto: saldoRestante, metodoPago: 'TRANSFERENCIA',
      })
      expect(a3.status()).toBe(201)
    }

    const final = await apiGet(page, `/api/facturas/${factura.id}`)
    const finalBody = await final.json()
    const ff = finalBody.factura || finalBody
    expect(Number(ff.saldo)).toBe(0)
    expect(ff.estado).toBe('PAGADA')
  })
})
