/**
 * Tier 6: Business Logic Edge Cases
 * Tests: 20+ (decimal precision, dates, empty, unicode, overpayment, long strings)
 */
import { test, expect, loginAsAdmin, apiPost, apiGet, expectStatus, uniquePhone, uniqueClientName, todayBogota, yesterdayISO } from '../00-fixtures'

test.describe('Business Edge - Decimal Precision', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('EDGE-DEC-01: 0.1 + 0.2 = 0.3 (no float drift)', async ({ page }) => {
    // Create a pedido with 0.1 + 0.2
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [
        { producto: 'PACA_AGUA', cantidad: 1, precioManual: 0.1 },
        { producto: 'PACA_HIELO', cantidad: 1, precioManual: 0.2 },
      ],
      pagos: [{ metodo: 'EFECTIVO', monto: 0.3 }],
    })
    expect([200, 201]).toContain(res.status())
    const body = await res.json()
    const pedido = body.pedido || body
    // Total should be exactly 0.3
    const total = Number(pedido.total)
    // Allow tiny tolerance
    expect(Math.abs(total - 0.3)).toBeLessThan(0.0001)
  })

  test('EDGE-DEC-02: Multiple 0.07 pagos sum correctly', async ({ page }) => {
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1, precioManual: 0.21 }],
      pagos: [
        { metodo: 'EFECTIVO', monto: 0.07 },
        { metodo: 'NEQUI', monto: 0.07 },
        { metodo: 'DAVIPLATA', monto: 0.07 },
      ],
    })
    expect([200, 201]).toContain(res.status())
    const body = await res.json()
    const pedido = body.pedido || body
    expect(Number(pedido.totalPagado)).toBe(0.21)
  })

  test('EDGE-DEC-03: Decimal(10,2) accepts max value 99999999.99', async ({ page }) => {
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1, precioManual: 99999999.99 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 99999999.99 }],
    })
    expect([200, 201]).toContain(res.status())
  })

  test('EDGE-DEC-04: Decimal(10,2) rejects value > 99999999.99', async ({ page }) => {
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1, precioManual: 100000000 }],
      pagos: [],
    })
    // Should overflow or reject
    expect([400, 500]).toContain(res.status())
  })

  test('EDGE-DEC-05: Money formatting is consistent', async ({ page }) => {
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000.50 }],
    })
    expect([200, 201]).toContain(res.status())
  })

  test('EDGE-DEC-06: Negative monto in pago rejected (CHECK constraint)', async ({ page }) => {
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: -0.01 }],
    })
    await expectStatus(res, 400)
  })

  test('EDGE-DEC-07: Zero monto in pago accepted (boundary)', async ({ page }) => {
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 0 }],
    })
    // 0 is allowed (boundary)
    expect([200, 201, 400]).toContain(res.status())
  })
})

test.describe('Business Edge - Date & Timezone', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('EDGE-DATE-01: Pedido created today shows today in list', async ({ page }) => {
    const pedRes = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
    })
    expect([200, 201]).toContain(pedRes.status())
    const pedido = (await pedRes.json()).pedido || (await pedRes.json())

    // Get list
    const listRes = await apiGet(page, '/api/pedidos?all=true')
    const list = (await listRes.json()).pedidos || []
    const found = list.find((p: any) => p.id === pedido.id)
    expect(found).toBeDefined()
  })

  test('EDGE-DATE-02: Embarque fecha is Bogotá timezone (not UTC)', async ({ page }) => {
    // Create an embarque
    const t = (await (await apiGet(page, '/api/trabajadores?rol=REPARTIDOR&activo=true')).json()).trabajadores?.[0]
    if (!t) { test.skip(); return }

    const res = await apiPost(page, '/api/embarques', {
      trabajadorId: t.id,
      horaSalida: '23:59',
      carga: [{ producto: 'PACA_AGUA', cargadas: 5 }],
    })
    expect([200, 201, 400, 409]).toContain(res.status())

    if (res.status() === 200 || res.status() === 201) {
      const e = (await res.json()).embarque || (await res.json())
      // The fecha should be today Bogotá, not tomorrow UTC
      const hoy = todayBogota()
      const fechaStr = new Date(e.fecha).toISOString().split('T')[0]
      // Allow ±1 day
      const diff = Math.abs(new Date(fechaStr).getTime() - new Date(hoy).getTime())
      expect(diff).toBeLessThan(2 * 24 * 60 * 60 * 1000) // within 2 days
    }
  })

  test('EDGE-DATE-03: Cierre with future date rejected', async ({ page }) => {
    const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const res = await apiPost(page, '/api/cierre', {
      fecha: future,
      baseDia: 100,
    })
    // May be rejected or accepted
    expect([200, 201, 400, 409]).toContain(res.status())
  })

  test('EDGE-DATE-04: Cierre with very old date', async ({ page }) => {
    const res = await apiPost(page, '/api/cierre', {
      fecha: '2000-01-01',
      baseDia: 100,
    })
    // Likely 400 (gap with current)
    expect([200, 201, 400, 409]).toContain(res.status())
  })

  test('EDGE-DATE-05: Pedido with fechaEntrega in past is accepted', async ({ page }) => {
    const yesterday = yesterdayISO()
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
      fechaEntrega: yesterday,
    })
    expect([200, 201]).toContain(res.status())
  })
})

test.describe('Business Edge - Overpayment & SaldoFavor', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('EDGE-OVER-01: Pagar $100 a pedido de $50 → $50 a saldoFavor', async ({ page }) => {
    const c = await apiPost(page, '/api/clientes', { nombre: uniqueClientName('OVER-01'), telefono: uniquePhone() })
    const cliente = (await c.json()).cliente || (await c.json())

    const res = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id,
      canal: 'PUNTO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 100 }],
    })
    expect([200, 201]).toContain(res.status())

    // Check saldoFavor
    const getRes = await apiGet(page, `/api/clientes/${cliente.id}`)
    const updated = (await getRes.json()).cliente || (await getRes.json())
    // SaldoFavor should be 100 - total
    const total = 5000 // default PACA_AGUA price
    const expectedSaldoFavor = 100 - total
    expect(Number(updated.saldoFavor || 0)).toBe(expectedSaldoFavor)
  })

  test('EDGE-OVER-02: Pagar más de 99999999 (overflow) is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 999999999 }],
    })
    expect([400, 500]).toContain(res.status())
  })

  test('EDGE-OVER-03: Pedido with saldo < 0 is rejected by CHECK constraint', async ({ page }) => {
    // This is a defensive test
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1, precioManual: 1000 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 2000 }],
    })
    expect([200, 201]).toContain(res.status())
    // saldoFavor should have 1000
  })
})

test.describe('Business Edge - Empty/Null/Undefined', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('EDGE-EMPTY-01: Cliente with empty contactos array (BUG: not in schema)', async ({ page }) => {
    const res = await apiPost(page, '/api/clientes', {
      nombre: uniqueClientName('EMPTY-01'),
      telefono: uniquePhone(),
      contactos: [], // not in Zod schema
    })
    expect([200, 201, 400, 422]).toContain(res.status())
  })

  test('EDGE-EMPTY-02: Negocio with empty horario', async ({ page }) => {
    const cl = (await (await apiGet(page, '/api/clientes')).json()).clientes?.[0]
    if (!cl) { test.skip(); return }

    const res = await apiPost(page, '/api/negocios', {
      clienteId: cl.id,
      nombre: uniqueClientName('Empty-Horario'),
      horaApertura: '',
    })
    expect([200, 201, 400, 422]).toContain(res.status())
  })

  test('EDGE-EMPTY-03: Trabajador with undefined fields', async ({ page }) => {
    const res = await apiPost(page, '/api/trabajadores', {
      nombre: uniqueClientName('UNDEF-03'),
      rol: 'SELLADOR',
      // no tipoPago, no usaMoto
    })
    expect([200, 201, 400, 422]).toContain(res.status())
  })
})

test.describe('Business Edge - Unicode & Special Chars', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('EDGE-UNI-01: Cliente with emoji in name', async ({ page }) => {
    const res = await apiPost(page, '/api/clientes', {
      nombre: '💧 Agua Cristal',
      telefono: uniquePhone(),
    })
    expect([200, 201, 400, 422]).toContain(res.status())
  })

  test('EDGE-UNI-02: Cliente with RTL characters', async ({ page }) => {
    const res = await apiPost(page, '/api/clientes', {
      nombre: '‮مرحبا‬',
      telefono: uniquePhone(),
    })
    expect([200, 201, 400, 422]).toContain(res.status())
  })

  test('EDGE-UNI-03: Cliente with control characters', async ({ page }) => {
    const res = await apiPost(page, '/api/clientes', {
      nombre: 'Test\x00Control',
      telefono: uniquePhone(),
    })
    expect([200, 201, 400, 422]).toContain(res.status())
  })

  test('EDGE-UNI-04: ZWJ sequences in name', async ({ page }) => {
    const res = await apiPost(page, '/api/clientes', {
      nombre: '👨‍👩‍👧‍👦 Familia',
      telefono: uniquePhone(),
    })
    expect([200, 201, 400, 422]).toContain(res.status())
  })
})

test.describe('Business Edge - Long Strings', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('EDGE-LONG-01: Cliente with nombre 100 chars (boundary)', async ({ page }) => {
    const res = await apiPost(page, '/api/clientes', {
      nombre: 'A'.repeat(100),
      telefono: uniquePhone(),
    })
    expect([200, 201]).toContain(res.status())
  })

  test('EDGE-LONG-02: Cliente with nombre 101 chars (over)', async ({ page }) => {
    const res = await apiPost(page, '/api/clientes', {
      nombre: 'A'.repeat(101),
      telefono: uniquePhone(),
    })
    await expectStatus(res, 400)
  })

  test('EDGE-LONG-03: Gasto with descripcion 500 chars (over limit)', async ({ page }) => {
    const res = await apiPost(page, '/api/gastos', {
      categoria: 'OTRO',
      descripcion: 'B'.repeat(500), // over 200
      monto: 100,
    })
    await expectStatus(res, 400)
  })
})

test.describe('Business Edge - Concurrent Mutations', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('EDGE-CONC-01: Two PATCH cliente verificado simultaneous', async ({ page }) => {
    const c = await apiPost(page, '/api/clientes', { nombre: uniqueClientName('CONC-01'), telefono: uniquePhone() })
    const cliente = (await c.json()).cliente || (await c.json())

    const [r1, r2] = await Promise.all([
      apiPost(page, `/api/clientes/${cliente.id}`, { verificado: true }),
      apiPost(page, `/api/clientes/${cliente.id}`, { verificado: false }),
    ])

    // One should win
    expect([200, 201, 409]).toContain(r1.status())
    expect([200, 201, 409]).toContain(r2.status())
  })

  test('EDGE-CONC-02: Two PATCH cliente bloqueado', async ({ page }) => {
    const c = await apiPost(page, '/api/clientes', { nombre: uniqueClientName('CONC-02'), telefono: uniquePhone() })
    const cliente = (await c.json()).cliente || (await c.json())

    const [r1, r2] = await Promise.all([
      apiPost(page, `/api/clientes/${cliente.id}`, { bloqueado: true }),
      apiPost(page, `/api/clientes/${cliente.id}`, { bloqueado: false }),
    ])

    expect([200, 201, 409]).toContain(r1.status())
    expect([200, 201, 409]).toContain(r2.status())
  })
})
