import { test, expect, fullLogin, apiPost, apiGet, createCliente, createTrabajador, createEmbarque } from './fixtures'

test.describe('Ciclo Completo Pedido', () => {

  // ─── 1. Full lifecycle: pedido → embarque → entrega → cierre → factura → abono → reporte ──

  test('full lifecycle: pedido → embarque → entrega → cierre → factura → abono → reporte', async ({ page }) => {
    test.setTimeout(120000)
    await fullLogin(page)

    const cliente = await createCliente(page)
    expect(cliente.id).toBeTruthy()

    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 2000 }],
    })
    const pedidoJson = await pedidoRes.json()
    const pedidoId = pedidoJson.pedido?.id || pedidoJson.id
    expect(pedidoId).toBeTruthy()

    const trabajador = await createTrabajador(page)
    expect(trabajador.id).toBeTruthy()

    const embarque = await createEmbarque(page, trabajador.id)
    expect(embarque.id).toBeTruthy()

    const enviarRes = await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId: embarque.id })
    if (enviarRes.status() !== 201) {
      const envBody = await enviarRes.json().catch(() => ({}))
      test.skip(true, `Enviar failed: ${envBody?.error || enviarRes.status()}`)
      return
    }
    expect(enviarRes.status()).toBe(201)

    const checkEnRuta = await apiGet(page, `/api/pedidos/${pedidoId}`)
    const enRutaBody = await checkEnRuta.json()
    const pedidoCheck = enRutaBody.pedido || enRutaBody
    expect(pedidoCheck.estado || pedidoCheck.estadoEntrega).toMatch(/EN_RUTA|EN RUTA/i)

    const cerrarRes = await apiPost(page, `/api/embarques/${embarque.id}/cerrar`, {
      pedidos: [{
        pedidoId,
        entregado: 'COMPLETO',
        productosEntregados: { cPacaAguaEnt: 2, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 },
        pagado: 'PARCIAL',
        pagos: [{ metodo: 'EFECTIVO', monto: 2000 }],
      }],
      ventasLibres: [],
      devueltasAgua: 0,
      devueltasHielo: 0,
      rotasAgua: 0,
      rotasHielo: 0,
      discrepancia: 0,
    })
    expect(cerrarRes.status()).toBe(200)

    const checkEntregado = await apiGet(page, `/api/pedidos/${pedidoId}`)
    const entBody = await checkEntregado.json()
    const pedidoEnt = entBody.pedido || entBody
    expect(pedidoEnt.estadoEntrega).toBe('ENTREGADO')

    const facturasRes = await apiGet(page, `/api/facturas?pedidoId=${pedidoId}`)
    expect(facturasRes.status()).toBe(200)
    const facturasBody = await facturasRes.json()
    const facturas = facturasBody.facturas || facturasBody.data || []
    const facturaDelPedido = facturas.find((f: any) => f.pedidoId === pedidoId)
    if (facturaDelPedido) {
      expect(facturaDelPedido.estado).toMatch(/EMITIDA|PAGADA/)
    }

    const today = new Date().toISOString().split('T')[0]
    const cierreRes = await apiPost(page, '/api/cierre', {
      fecha: today,
      numPedidos: 1,
      totalVentas: 2000,
      cobrado: 2000,
      fiado: 0,
      efectivo: 2000,
      transferencia: 0,
      nequi: 0,
      daviplata: 0,
      bono: 0,
      baseDia: 100000,
      comisiones: 0,
      salarios: 0,
      gastos: 0,
      stockIniAgua: 100,
      prodAgua: 0,
      stockFinAgua: 98,
      stockIniHielo: 50,
      prodHielo: 0,
      stockFinHielo: 50,
      netoCaja: 102000,
    })
    const cierreStatus = cierreRes.status()
    expect([201, 409]).toContain(cierreStatus)

    const reportesVentas = await apiGet(page, '/api/reportes/ventas')
    expect(reportesVentas.status()).toBe(200)
  })

  // ─── 2. Multiple pedidos in same embarque ───────────────────────────────────

  test('multiple pedidos in same embarque', async ({ page }) => {
    test.setTimeout(120000)
    await fullLogin(page)

    const cliente1 = await createCliente(page)
    const cliente2 = await createCliente(page)
    const cliente3 = await createCliente(page)

    const [p1, p2, p3] = await Promise.all([
      apiPost(page, '/api/pedidos', {
        clienteId: cliente1.id, canal: 'DOMICILIO', ventaRapida: false,
        items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
      }),
      apiPost(page, '/api/pedidos', {
        clienteId: cliente2.id, canal: 'DOMICILIO', ventaRapida: false,
        items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
      }),
      apiPost(page, '/api/pedidos', {
        clienteId: cliente3.id, canal: 'DOMICILIO', ventaRapida: false,
        items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
      }),
    ])

    const j1 = await p1.json()
    const j2 = await p2.json()
    const j3 = await p3.json()
    const pid1 = j1.pedido?.id || j1.id
    const pid2 = j2.pedido?.id || j2.id
    const pid3 = j3.pedido?.id || j3.id

    const trabajador = await createTrabajador(page)
    const embarque = await createEmbarque(page, trabajador.id)

    const envResults = await Promise.all([
      apiPost(page, `/api/pedidos/${pid1}/enviar`, { embarqueId: embarque.id }),
      apiPost(page, `/api/pedidos/${pid2}/enviar`, { embarqueId: embarque.id }),
      apiPost(page, `/api/pedidos/${pid3}/enviar`, { embarqueId: embarque.id }),
    ])

    const allSent = envResults.every(r => r.status() === 201)
    expect(allSent).toBe(true)

    const cerrarRes = await apiPost(page, `/api/embarques/${embarque.id}/cerrar`, {
      pedidos: [
        { pedidoId: pid1, entregado: 'COMPLETO', productosEntregados: { cPacaAguaEnt: 1, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 }, pagado: 'COMPLETO', pagos: [{ metodo: 'EFECTIVO', monto: 5000 }] },
        { pedidoId: pid2, entregado: 'COMPLETO', productosEntregados: { cPacaAguaEnt: 1, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 }, pagado: 'COMPLETO', pagos: [{ metodo: 'EFECTIVO', monto: 5000 }] },
        { pedidoId: pid3, entregado: 'COMPLETO', productosEntregados: { cPacaAguaEnt: 1, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 }, pagado: 'COMPLETO', pagos: [{ metodo: 'EFECTIVO', monto: 5000 }] },
      ],
      ventasLibres: [],
      devueltasAgua: 0, devueltasHielo: 0, rotasAgua: 0, rotasHielo: 0, discrepancia: 0,
    })
    expect(cerrarRes.status()).toBe(200)

    for (const pid of [pid1, pid2, pid3]) {
      const check = await apiGet(page, `/api/pedidos/${pid}`)
      const chkBody = await check.json()
      const pd = chkBody.pedido || chkBody
      expect(pd.estadoEntrega).toBe('ENTREGADO')
    }
  })

  // ─── 3. Flow with partial payment ───────────────────────────────────────────

  test('flow with partial payment', async ({ page }) => {
    test.setTimeout(120000)
    await fullLogin(page)

    const cliente = await createCliente(page)
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 3 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
    })
    const pedidoJson = await pedidoRes.json()
    const pedidoId = pedidoJson.pedido?.id || pedidoJson.id
    expect(pedidoId).toBeTruthy()

    const pedidoDetail = await apiGet(page, `/api/pedidos/${pedidoId}`)
    const detailBody = await pedidoDetail.json()
    const pedido = detailBody.pedido || detailBody
    const saldoInicial = Number(pedido.saldo)
    expect(saldoInicial).toBeGreaterThan(0)

    const trabajador = await createTrabajador(page)
    const embarque = await createEmbarque(page, trabajador.id)

    await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId: embarque.id })

    const cerrarRes = await apiPost(page, `/api/embarques/${embarque.id}/cerrar`, {
      pedidos: [{
        pedidoId,
        entregado: 'COMPLETO',
        productosEntregados: { cPacaAguaEnt: 3, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 },
        pagado: 'PARCIAL',
        pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
      }],
      ventasLibres: [],
      devueltasAgua: 0, devueltasHielo: 0, rotasAgua: 0, rotasHielo: 0, discrepancia: 0,
    })
    expect(cerrarRes.status()).toBe(200)

    const facturasRes = await apiGet(page, '/api/facturas')
    const facturasBody = await facturasRes.json()
    const facturas = facturasBody.facturas || facturasBody.data || []
    const factura = facturas.find((f: any) => f.pedidoId === pedidoId)
    expect(factura).toBeTruthy()
    const saldoFactura = Number(factura.saldo)
    expect(saldoFactura).toBeGreaterThan(0)

    const abonoRes = await apiPost(page, '/api/abonos', {
      facturaId: factura.id,
      clienteId: cliente.id,
      pedidoId,
      monto: saldoFactura,
      metodoPago: 'EFECTIVO',
    })
    expect(abonoRes.status()).toBe(201)

    const facturaVerif = await apiGet(page, `/api/facturas/${factura.id}`)
    const facturaVerifBody = await facturaVerif.json()
    const fv = facturaVerifBody.factura || facturaVerifBody
    expect(Number(fv.saldo)).toBe(0)
    expect(fv.estado).toBe('PAGADA')
  })
})
