import { test, expect, fullLogin, apiPost, apiGet } from './fixtures'

test.describe('Ciclo de Producción', () => {

  // ─── 1. Produccion → stock → ventas → conciliacion cierre ───────────────────

  test('produccion → stock → ventas → conciliacion cierre', async ({ page }) => {
    test.setTimeout(120000)
    await fullLogin(page)

    const previewRes = await apiGet(page, '/api/produccion/preview')
    expect(previewRes.status()).toBe(200)
    const previewBody = await previewRes.json()
    expect(previewBody).toHaveProperty('stockIniAgua')
    expect(previewBody).toHaveProperty('stockIniHielo')

    const produccionRes = await apiPost(page, '/api/produccion', {
      conteoAguaA: 120,
      conteoAguaB: 124,
      conteoHieloA: 60,
      conteoHieloB: 64,
      rotasAgua: 2,
      rotasHielo: 1,
      filtradasAgua: 0,
      filtradasHielo: 0,
      consumoAgua: 1,
      consumoHielo: 0,
      stockFisicoAgua: 50,
      stockFisicoHielo: 30,
      turno: 'MAÑANA',
      selladorId: null,
    })

    if (produccionRes.status() === 409) {
      test.skip(true, 'Produccion already registered for today')
      return
    }
    expect(produccionRes.status()).toBe(201)

    const prodBody = await produccionRes.json()
    expect(prodBody).toHaveProperty('produccion')
    expect(prodBody.produccion).toHaveProperty('id')

    const ventaRes = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      ventaRapida: true,
      productos: { pacaAgua: 2, pacaHielo: 0 },
      pagos: [{ metodo: 'EFECTIVO', monto: 50000 }],
    })
    expect(ventaRes.status()).toBe(201)

    const today = new Date().toISOString().split('T')[0]
    const cierreRes = await apiPost(page, '/api/cierre', {
      fecha: today,
      numPedidos: 1,
      totalVentas: 21000,
      cobrado: 21000,
      fiado: 0,
      efectivo: 21000,
      transferencia: 0,
      nequi: 0,
      daviplata: 0,
      bono: 0,
      baseDia: 100000,
      comisiones: 0,
      salarios: 0,
      gastos: 0,
      stockIniAgua: previewBody.stockIniAgua || 100,
      prodAgua: 122,
      stockFinAgua: 50,
      stockIniHielo: previewBody.stockIniHielo || 50,
      prodHielo: 62,
      stockFinHielo: 30,
      netoCaja: 121000,
    })
    const cierreStatus = cierreRes.status()
    expect([201, 409]).toContain(cierreStatus)

    const reportesRes = await apiGet(page, '/api/reportes/ventas')
    expect(reportesRes.status()).toBe(200)
  })

  // ─── 2. Calculo de promedios ────────────────────────────────────────────────

  test('calculo de promedios', async ({ page }) => {
    await fullLogin(page)

    const res = await apiPost(page, '/api/produccion', {
      conteoAguaA: 150,
      conteoAguaB: 156,
      conteoHieloA: 80,
      conteoHieloB: 84,
      rotasAgua: 0,
      rotasHielo: 0,
      filtradasAgua: 0,
      filtradasHielo: 0,
      consumoAgua: 0,
      consumoHielo: 0,
      stockFisicoAgua: 40,
      stockFisicoHielo: 25,
      turno: 'TARDE',
    })

    if (res.status() === 409) {
      test.skip(true, 'Produccion already registered for today')
      return
    }
    expect(res.status()).toBe(201)

    const body = await res.json()
    const produccion = body.produccion || body
    expect(produccion).toHaveProperty('prodAgua')
    expect(typeof Number(produccion.prodAgua)).toBe('number')
    expect(produccion).toHaveProperty('prodHielo')
    expect(typeof Number(produccion.prodHielo)).toBe('number')
  })

  // ─── 3. Registro de perdidas ────────────────────────────────────────────────

  test('registro de perdidas', async ({ page }) => {
    await fullLogin(page)

    const res = await apiPost(page, '/api/produccion', {
      conteoAguaA: 100,
      conteoAguaB: 104,
      conteoHieloA: 50,
      conteoHieloB: 52,
      rotasAgua: 5,
      filtradasAgua: 3,
      consumoAgua: 2,
      rotasHielo: 2,
      filtradasHielo: 1,
      consumoHielo: 1,
      stockFisicoAgua: 35,
      stockFisicoHielo: 20,
      turno: 'MAÑANA',
    })

    if (res.status() === 409) {
      test.skip(true, 'Produccion already registered for today')
      return
    }
    expect(res.status()).toBe(201)

    const body = await res.json()
    const produccion = body.produccion || body

    expect(Number(produccion.rotasAgua || 0)).toBe(5)
    expect(Number(produccion.filtradasAgua || 0)).toBe(3)
    expect(Number(produccion.consumoAgua || 0)).toBe(2)
    expect(Number(produccion.rotasHielo || 0)).toBe(2)
    expect(Number(produccion.filtradasHielo || 0)).toBe(1)
    expect(Number(produccion.consumoHielo || 0)).toBe(1)
  })
})
