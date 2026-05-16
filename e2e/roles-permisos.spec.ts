import { test, expect, BASE, fullLogin, goto, apiPost, apiGet, apiDelete, createCliente, createTrabajador, createPedido, createEmbarque, getFirstTrabajador, getFirstFacturaConSaldo } from './fixtures'

const PROTECTED_PAGES = [
  '/dashboard', '/pedidos', '/clientes', '/embarques', '/produccion',
  '/cierre', '/facturas', '/gastos', '/nomina', '/trabajadores',
  '/proveedores', '/compras', '/insumos', '/reportes', '/productos',
  '/rutas', '/recurrentes', '/casos', '/configuracion', '/repartidor',
]

// ═══════════════════════════════════════════════════════════════════════════════
// 1. SIN AUTENTICACIÓN
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('1. Sin autenticación', () => {
  for (const path of PROTECTED_PAGES) {
    test(`Redirige ${path} a /login`, async ({ page }) => {
      await page.goto(`${BASE}${path}`)
      await page.waitForTimeout(500)
      await expect(page).toHaveURL(/.*\/login/, { timeout: 10000 })
    })
  }

  test('API POST sin auth → 401', async ({ request }) => {
    const res = await request.post(`${BASE}/api/clientes`, {
      data: { nombre: 'NoAuth Test', telefono: '3000000000' },
    })
    expect(res.status()).toBe(401)
  })

  test('API DELETE sin auth → 401', async ({ request }) => {
    const res = await request.delete(`${BASE}/api/trabajadores/dummy-id`)
    expect(res.status()).toBe(401)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. ADMIN — ACCESO TOTAL
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('2. ADMIN — acceso total', () => {
  test.beforeEach(async ({ page }) => {
    await fullLogin(page, 'admin', 'admin123')
  })

  test('Accede a todas las páginas protegidas sin redirect', async ({ page }) => {
    for (const path of PROTECTED_PAGES) {
      await goto(page, path)
      await page.waitForTimeout(500)
      const segment = path.split('/')[1]
      expect(page.url()).toContain(segment)
    }
  })

  test('Crea cliente (API) → 200', async ({ page }) => {
    const cliente = await createCliente(page, { nombre: 'Admin Cliente Test' })
    expect(cliente.cliente).toBeDefined()
    expect(cliente.cliente.nombre).toBe('Admin Cliente Test')
  })

  test('Crea embarque (API) → 200', async ({ page }) => {
    const trabajador = await getFirstTrabajador(page)
    if (!trabajador) { test.skip(); return }
    const embarque = await createEmbarque(page, trabajador.id)
    expect(embarque.embarque).toBeDefined()
  })

  test('Crea nómina (API) → 200', async ({ page }) => {
    const trabajador = await getFirstTrabajador(page)
    if (!trabajador) { test.skip(); return }

    const hoy = new Date()
    const hace7 = new Date(hoy)
    hace7.setDate(hace7.getDate() - 7)

    const res = await apiPost(page, '/api/nomina', {
      trabajadorId: trabajador.id,
      fechaInicio: hace7.toISOString(),
      fechaFin: hoy.toISOString(),
      tipoCalculo: 'MANUAL',
      comEntregasAgua: 10000,
      comEntregasHielo: 5000,
      totalComisiones: 15000,
      salario: 0,
      total: 15000,
    })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  test('Cierra día (API) → 200', async ({ page }) => {
    const res = await apiPost(page, '/api/cierre-dia', {
      numPedidos: 0, totalVentas: 0, aguaVendida: 0, hieloVendido: 0,
      cobrado: 0, fiado: 0, efectivo: 0, transferencia: 0, nequi: 0,
      daviplata: 0, baseDia: 100000, comisiones: 0, salarios: 0, gastos: 0,
      stockIniAgua: 0, prodAgua: 0, stockFinAgua: 0,
      stockIniHielo: 0, prodHielo: 0, stockFinHielo: 0,
      netoCaja: 100000,
    })
    expect(res.ok()).toBe(true)
  })

  test('Crea abono (API) → 200', async ({ page }) => {
    const factura = await getFirstFacturaConSaldo(page)
    if (!factura) { test.skip(); return }

    const monto = Math.min(1000, Number(factura.saldo))
    const res = await apiPost(page, '/api/abonos', {
      facturaId: factura.id,
      clienteId: factura.clienteId,
      monto,
      metodoPago: 'EFECTIVO',
    })
    expect(res.ok()).toBe(true)
  })

  test('Crea config (API) → 200', async ({ page }) => {
    const key = `TEST_CONFIG_${Date.now()}`
    const res = await apiPost(page, '/api/config', {
      clave: key,
      valor: 'test-value',
    })
    expect(res.ok()).toBe(true)
  })

  test('Crea caso (API) → 200', async ({ page }) => {
    const res = await apiPost(page, '/api/casos', {
      alertaTipo: 'CALIDAD',
      severidad: 'BAJA',
      titulo: `Caso Test Admin ${Date.now()}`,
      descripcion: 'Descripción de prueba',
    })
    expect(res.ok()).toBe(true)
  })

  test('Elimina trabajador (API) → 200', async ({ page }) => {
    const trabajador = await createTrabajador(page, {
      nombre: `Temp Delete ${Date.now() % 10000}`,
      rol: 'REPARTIDOR',
    })
    if (!trabajador.trabajador?.id) { test.skip(); return }

    const res = await apiDelete(page, `/api/trabajadores/${trabajador.trabajador.id}`)
    expect(res.ok()).toBe(true)
  })

  test('API rutas/analisis → 200', async ({ page }) => {
    const res = await apiGet(page, '/api/rutas/analisis')
    expect(res.ok()).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3. ASISTENTE — ACCESO LIMITADO
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('3. ASISTENTE — acceso limitado', () => {
  test.beforeEach(async ({ page }) => {
    await fullLogin(page, 'asistente', 'asist123')
  })

  const allowedPages = ['/dashboard', '/pedidos', '/clientes', '/facturas', '/embarques', '/gastos', '/produccion']
  const forbiddenPages = ['/trabajadores', '/cierre', '/reportes', '/productos', '/nomina', '/configuracion']

  test('Accede a páginas permitidas sin redirect', async ({ page }) => {
    for (const path of allowedPages) {
      await goto(page, path)
      await page.waitForTimeout(500)
      const segment = path.split('/')[1]
      expect(page.url()).toContain(segment)
    }
  })

  test('Redirige a /dashboard desde páginas restringidas', async ({ page }) => {
    for (const path of forbiddenPages) {
      await goto(page, path)
      await page.waitForTimeout(500)
      expect(page.url()).toContain('/dashboard')
    }
  })

  test('Crea cliente (API) → 200', async ({ page }) => {
    const cliente = await createCliente(page, { nombre: 'Asistente Cliente Test' })
    expect(cliente.cliente).toBeDefined()
  })

  test('Crea pedido (API) → 200', async ({ page }) => {
    const cliente = await createCliente(page, { nombre: 'Asistente Pedido Test' })
    const pedido = await createPedido(page, {
      clienteId: cliente.cliente.id,
      ventaRapida: true,
      canal: 'PUNTO',
      pacaAgua: 1,
      pagoMetodo: 'EFECTIVO',
      pagoMonto: 2800,
    })
    expect(pedido.pedido).toBeDefined()
  })

  test('NO puede crear embarque (API) → 403', async ({ page }) => {
    const trabajador = await getFirstTrabajador(page)
    if (!trabajador) { test.skip(); return }

    const res = await apiPost(page, '/api/embarques', { trabajadorId: trabajador.id })
    expect(res.status()).toBe(403)
  })

  test('NO puede cerrar día (API) → 403', async ({ page }) => {
    const res = await apiPost(page, '/api/cierre-dia', {
      numPedidos: 0, totalVentas: 0, cobrado: 0, fiado: 0,
      efectivo: 0, transferencia: 0, nequi: 0, daviplata: 0,
      baseDia: 100000, comisiones: 0, salarios: 0, gastos: 0,
      stockIniAgua: 0, prodAgua: 0, stockFinAgua: 0,
      stockIniHielo: 0, prodHielo: 0, stockFinHielo: 0,
      netoCaja: 100000,
    })
    expect(res.status()).toBe(403)
  })

  test('NO puede crear abono (API) → 403', async ({ page }) => {
    const factura = await getFirstFacturaConSaldo(page)
    if (!factura) { test.skip(); return }

    const res = await apiPost(page, '/api/abonos', {
      facturaId: factura.id,
      clienteId: factura.clienteId,
      monto: 1000,
      metodoPago: 'EFECTIVO',
    })
    expect(res.status()).toBe(403)
  })

  test('NO puede crear nómina (API) → 403', async ({ page }) => {
    const trabajador = await getFirstTrabajador(page)
    if (!trabajador) { test.skip(); return }

    const hoy = new Date()
    const hace7 = new Date(hoy)
    hace7.setDate(hace7.getDate() - 7)

    const res = await apiPost(page, '/api/nomina', {
      trabajadorId: trabajador.id,
      fechaInicio: hace7.toISOString(),
      fechaFin: hoy.toISOString(),
      tipoCalculo: 'MANUAL',
      comEntregasAgua: 5000,
      comEntregasHielo: 3000,
      totalComisiones: 8000,
      salario: 0,
      total: 8000,
    })
    expect(res.status()).toBe(403)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 4. CONTADOR — ACCESO FINANCIERO
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('4. CONTADOR — acceso financiero', () => {
  test.beforeEach(async ({ page }) => {
    await fullLogin(page, 'contador', 'cont123')
  })

  test('Accede a páginas administrativas', async ({ page }) => {
    const adminPages = ['/trabajadores', '/cierre', '/reportes', '/productos', '/nomina', '/configuracion']
    for (const path of adminPages) {
      await goto(page, path)
      await page.waitForTimeout(500)
      const segment = path.split('/')[1]
      expect(page.url()).toContain(segment)
    }
  })

  test('Accede a dashboard, pedidos, facturas, gastos', async ({ page }) => {
    for (const path of ['/dashboard', '/pedidos', '/facturas', '/gastos']) {
      await goto(page, path)
      await page.waitForTimeout(500)
      const segment = path.split('/')[1]
      expect(page.url()).toContain(segment)
    }
  })

  test('Crea abono (API) → 200', async ({ page }) => {
    const factura = await getFirstFacturaConSaldo(page)
    if (!factura) { test.skip(); return }

    const monto = Math.min(5000, Number(factura.saldo))
    const res = await apiPost(page, '/api/abonos', {
      facturaId: factura.id,
      clienteId: factura.clienteId,
      monto,
      metodoPago: 'TRANSFERENCIA',
    })
    expect(res.ok()).toBe(true)
  })

  test('Crea nómina (API) → 200', async ({ page }) => {
    const trabajador = await getFirstTrabajador(page)
    if (!trabajador) { test.skip(); return }

    const hoy = new Date()
    const hace7 = new Date(hoy)
    hace7.setDate(hace7.getDate() - 7)

    const res = await apiPost(page, '/api/nomina', {
      trabajadorId: trabajador.id,
      fechaInicio: hace7.toISOString(),
      fechaFin: hoy.toISOString(),
      tipoCalculo: 'MANUAL',
      comEntregasAgua: 15000,
      comEntregasHielo: 8000,
      totalComisiones: 23000,
      salario: 0,
      total: 23000,
    })
    expect(res.ok()).toBe(true)
  })

  test('NO puede crear embarque (API) → 403', async ({ page }) => {
    const trabajador = await getFirstTrabajador(page)
    if (!trabajador) { test.skip(); return }

    const res = await apiPost(page, '/api/embarques', { trabajadorId: trabajador.id })
    expect(res.status()).toBe(403)
  })

  test('NO puede crear cliente (API) → 403', async ({ page }) => {
    const res = await apiPost(page, '/api/clientes', {
      nombre: 'Contador Cliente Test',
      telefono: '3001112233',
    })
    expect(res.status()).toBe(403)
  })

  test('API abonos filtrado por facturaId → 200', async ({ page }) => {
    const factura = await getFirstFacturaConSaldo(page)
    const res = await apiGet(page, `/api/abonos?facturaId=${factura?.id || 'dummy'}`)
    expect(res.ok()).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 5. REPARTIDOR — ACCESO A PROPIA RUTA
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('5. REPARTIDOR — acceso a propia ruta', () => {
  test.beforeEach(async ({ page }) => {
    await fullLogin(page, 'repartidor', 'rep123')
  })

  test('Accede a /repartidor (Mi Ruta)', async ({ page }) => {
    await goto(page, '/repartidor')
    await page.waitForTimeout(500)
    expect(page.url()).toContain('/repartidor')
  })

  test('Accede a /dashboard', async ({ page }) => {
    await goto(page, '/dashboard')
    await page.waitForTimeout(500)
    expect(page.url()).toContain('/dashboard')
  })

  test('Sus embarques visibles en GET /api/embarques', async ({ page }) => {
    const res = await apiGet(page, '/api/embarques?all=true')
    expect(res.ok()).toBe(true)
    const body = await res.json()
    const embarques = body.embarques || body.data?.embarques || []
    expect(Array.isArray(embarques)).toBe(true)
  })

  test('NO puede acceder a /trabajadores → redirect', async ({ page }) => {
    await goto(page, '/trabajadores')
    await page.waitForTimeout(500)
    expect(page.url()).toContain('/dashboard')
  })

  test('NO puede acceder a /cierre → redirect', async ({ page }) => {
    await goto(page, '/cierre')
    await page.waitForTimeout(500)
    expect(page.url()).toContain('/dashboard')
  })

  test('NO puede crear cliente (API) → 403', async ({ page }) => {
    const res = await apiPost(page, '/api/clientes', {
      nombre: 'Repartidor Cliente Test',
      telefono: '3004445566',
    })
    expect(res.status()).toBe(403)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 6. CONCURRENCIA
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('6. Concurrencia', () => {
  test('Dos asistentes crean clientes simultáneamente → ambos 200', async ({ browser }) => {
    const ctx1 = await browser.newContext()
    const ctx2 = await browser.newContext()
    const p1 = await ctx1.newPage()
    const p2 = await ctx2.newPage()

    await fullLogin(p1, 'asistente', 'asist123')
    await fullLogin(p2, 'asistente', 'asist123')

    const [r1, r2] = await Promise.all([
      apiPost(p1, '/api/clientes', { nombre: `Concurrente A ${Date.now()}`, telefono: '3001111111' }),
      apiPost(p2, '/api/clientes', { nombre: `Concurrente B ${Date.now() + 1}`, telefono: '3002222222' }),
    ])

    expect(r1.ok()).toBe(true)
    expect(r2.ok()).toBe(true)

    await ctx1.close()
    await ctx2.close()
  })

  test('Admin y contador operan simultáneamente', async ({ browser }) => {
    const ctx1 = await browser.newContext()
    const ctx2 = await browser.newContext()
    const p1 = await ctx1.newPage()
    const p2 = await ctx2.newPage()

    await fullLogin(p1, 'admin', 'admin123')
    await fullLogin(p2, 'contador', 'cont123')

    const [r1, r2] = await Promise.all([
      apiPost(p1, '/api/clientes', { nombre: `Conc Admin ${Date.now()}`, telefono: '3003333333' }),
      apiGet(p2, '/api/facturas'),
    ])

    expect(r1.ok()).toBe(true)
    expect(r2.ok()).toBe(true)

    await ctx1.close()
    await ctx2.close()
  })

  test('Admin y asistente crean pedidos simultáneamente', async ({ browser }) => {
    const ctx1 = await browser.newContext()
    const ctx2 = await browser.newContext()
    const p1 = await ctx1.newPage()
    const p2 = await ctx2.newPage()

    await fullLogin(p1, 'admin', 'admin123')
    await fullLogin(p2, 'asistente', 'asist123')

    const [r1, r2] = await Promise.all([
      apiPost(p1, '/api/pedidos', {
        clienteId: 'CONSUMIDOR_FINAL',
        canal: 'PUNTO',
        ventaRapida: true,
        items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 2800 }],
      }),
      apiPost(p2, '/api/pedidos', {
        clienteId: 'CONSUMIDOR_FINAL',
        canal: 'PUNTO',
        ventaRapida: true,
        items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 2800 }],
      }),
    ])

    expect(r1.ok()).toBe(true)
    expect(r2.ok()).toBe(true)

    await ctx1.close()
    await ctx2.close()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 7. FLUJOS COMPLETOS POR ROL
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('7. Flujo completo: ASISTENTE', () => {
  test('Crear cliente → pedido → verificar en lista', async ({ page }) => {
    await fullLogin(page, 'asistente', 'asist123')

    const cliente = await createCliente(page, { nombre: `Flujo Asistente ${Date.now()}` })
    expect(cliente.cliente).toBeDefined()

    const pedido = await createPedido(page, {
      clienteId: cliente.cliente.id,
      ventaRapida: true,
      canal: 'PUNTO',
      pacaAgua: 2,
      pacaHielo: 1,
      pagoMetodo: 'EFECTIVO',
      pagoMonto: 8100,
    })
    expect(pedido.pedido).toBeDefined()

    const listRes = await apiGet(page, '/api/pedidos')
    const listBody = await listRes.json()
    const pedidos = listBody.pedidos || listBody.data?.pedidos || []
    const found = pedidos.find((p: any) => p.id === pedido.pedido.id)
    expect(found).toBeDefined()
  })
})

test.describe('7. Flujo completo: CONTADOR', () => {
  test('Ver facturas → hacer abono → verificar saldo actualizado', async ({ page }) => {
    await fullLogin(page, 'contador', 'cont123')

    const factura = await getFirstFacturaConSaldo(page)
    if (!factura) { test.skip(); return }

    const saldoOriginal = Number(factura.saldo)
    const montoAbono = Math.min(3000, saldoOriginal)

    const abonoRes = await apiPost(page, '/api/abonos', {
      facturaId: factura.id,
      clienteId: factura.clienteId,
      monto: montoAbono,
      metodoPago: 'NEQUI',
    })
    expect(abonoRes.ok()).toBe(true)

    const verifyRes = await apiGet(page, '/api/facturas')
    const verifyBody = await verifyRes.json()
    const facturas = verifyBody.facturas || verifyBody.data?.facturas || []
    const facturaUpdated = facturas.find((f: any) => f.id === factura.id)

    if (facturaUpdated) {
      const nuevoSaldo = Number(facturaUpdated.saldo)
      expect(nuevoSaldo).toBeCloseTo(saldoOriginal - montoAbono, 1)
    }
  })
})

test.describe('7. Flujo completo: ADMIN', () => {
  test('Crear trabajador → embarque → pedido → asignar → cerrar embarque', async ({ page }) => {
    test.setTimeout(60000)
    await fullLogin(page, 'admin', 'admin123')

    const trabajador = await createTrabajador(page, {
      nombre: `Rep Admin Flow ${Date.now() % 10000}`,
      rol: 'REPARTIDOR',
    })
    expect(trabajador.trabajador).toBeDefined()

    const embarque = await createEmbarque(page, trabajador.trabajador.id)
    expect(embarque.embarque).toBeDefined()

    const cliente = await createCliente(page, { nombre: `Cliente Admin Flow ${Date.now()}` })
    const pedido = await createPedido(page, {
      clienteId: cliente.cliente.id,
      ventaRapida: false,
      canal: 'DOMICILIO',
      pacaAgua: 2,
      pagoMetodo: 'EFECTIVO',
      pagoMonto: 5600,
    })
    expect(pedido.pedido).toBeDefined()

    const enviarRes = await apiPost(page, `/api/pedidos/${pedido.pedido.id}/enviar`, {
      embarqueId: embarque.embarque.id,
    })
    expect(enviarRes.ok()).toBe(true)

    const cerrarRes = await apiPost(page, `/api/embarques/${embarque.embarque.id}/cerrar`, {
      pedidos: [{
        pedidoId: pedido.pedido.id,
        entregado: 'COMPLETO',
        productosEntregados: {
          cPacaAguaEnt: 2,
          cPacaHieloEnt: 0,
          cBotellonFabEnt: 0,
          cBotellonDomEnt: 0,
          cBolsaAguaEnt: 0,
          cBolsaHieloEnt: 0,
        },
        pagado: 'COMPLETO',
        pagos: [{ metodo: 'EFECTIVO', monto: 5600 }],
      }],
      devueltasAgua: 0,
      devueltasHielo: 0,
      rotasAgua: 0,
      rotasHielo: 0,
    })
    expect(cerrarRes.ok()).toBe(true)
  })
})

test.describe('7. Flujo completo: REPARTIDOR', () => {
  test('Ver embarque asignado → navegar mi ruta', async ({ page }) => {
    await fullLogin(page, 'repartidor', 'rep123')

    const res = await apiGet(page, '/api/embarques?all=true')
    expect(res.ok()).toBe(true)
    const body = await res.json()
    const embarques = body.embarques || body.data?.embarques || []

    if (embarques.length === 0) {
      await goto(page, '/repartidor')
      await page.waitForTimeout(500)
      expect(page.url()).toContain('/repartidor')
      test.skip()
      return
    }

    expect(embarques.length).toBeGreaterThan(0)

    await goto(page, '/repartidor')
    await page.waitForTimeout(500)
    expect(page.url()).toContain('/repartidor')
  })
})
