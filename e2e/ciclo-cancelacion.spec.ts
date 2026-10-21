// @tests api/factura, api/pedido
import { test, expect, loginAs, apiPost, apiGet, createCliente, resetTestDatabase } from './fixtures'
import { prisma } from '../src/lib/prisma'

test.describe('Ciclo de Cancelación', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(() => {
    resetTestDatabase()
  })

  // ─── 1. Anular pedido entregado → nota de crédito → factura ANULADA ─────────

  test('anular pedido entregado → nota de crédito → factura ANULADA', async ({ page }) => {
    test.setTimeout(120000)
    await loginAs(page, 'admin')

    const cliente = await createCliente(page)
    expect(cliente.cliente.id).toBeTruthy()

    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.cliente.id,
      canal: 'PUNTO',
      entregado: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 50000 }],
    })
    const pedidoJson = await pedidoRes.json()
    const pedidoId = pedidoJson.pedido?.id || pedidoJson.id
    expect(pedidoId).toBeTruthy()

    const facturaRes = await apiPost(page, '/api/facturas', {
      pedidoId,
      clienteId: cliente.cliente.id,
    })
    const facturaJson = await facturaRes.json()
    const facturaId = facturaJson.factura?.id

    const anularRes = await apiPost(page, `/api/pedidos/${pedidoId}/anular`, {
      motivo: 'Test E2E cancelación',
      devolverStock: false,
    })

    expect(anularRes.status()).toBe(200)
    const anularBody = await anularRes.json()
    expect(anularBody.pedido.estado).toBe('ANULADO')
    // La API no devuelve la nota de crédito en el cuerpo (responde `{ pedido }`);
    // el hecho observable es la fila NotaCredito, creada por el pago cobrado (#362).
    const notaCredito = await prisma.notaCredito.findFirst({ where: { pedidoId } })
    expect(notaCredito).not.toBeNull()
    expect(Number(notaCredito?.monto)).toBeGreaterThan(0)

    if (facturaId) {
      const facturaCheck = await apiGet(page, `/api/facturas/${facturaId}`)
      const fcBody = await facturaCheck.json()
      const fc = fcBody.factura || fcBody
      expect(fc.estado).toBe('ANULADA')
    }
  })

  // ─── 2. Anular pedido no entregado debe fallar ──────────────────────────────

  test('anular pedido no entregado debe fallar', async ({ page }) => {
    await loginAs(page, 'admin')

    const cliente = await createCliente(page)
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.cliente.id,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
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
    const errorMsg = typeof errBody.error === 'string' ? errBody.error : (errBody.error?.message || errBody.message || '')
    expect(errorMsg).toMatch(/ENTREGADO|entregado|SOLO_ENTREGADO/i)
  })

  // ─── 3. Anular pedido ya anulado ────────────────────────────────────────────

  test('anular pedido ya anulado', async ({ page }) => {
    test.setTimeout(120000)
    await loginAs(page, 'admin')

    const cliente = await createCliente(page)
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.cliente.id,
      canal: 'PUNTO',
      entregado: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 50000 }],
    })
    const pedidoJson = await pedidoRes.json()
    const pedidoId = pedidoJson.pedido?.id || pedidoJson.id

    const anular1 = await apiPost(page, `/api/pedidos/${pedidoId}/anular`, {
      motivo: 'Primera anulación',
      devolverStock: false,
    })

    expect(anular1.status()).toBe(200)

    const anular2 = await apiPost(page, `/api/pedidos/${pedidoId}/anular`, {
      motivo: 'Segunda anulación',
      devolverStock: false,
    })

    // F-N21 (AnularPedidoUseCase): anular un pedido ya ANULADO es idempotente:
    // 200 con `deduped: true`, no un 400 YA_ANULADO, y no genera otra nota de crédito.
    expect(anular2.status()).toBe(200)
    const anular2Body = await anular2.json()
    expect(anular2Body.deduped).toBe(true)
    expect(anular2Body.pedido.estado).toBe('ANULADO')
    expect(await prisma.notaCredito.count({ where: { pedidoId } })).toBe(1)
  })

  // ─── 4. Pedido con hijos ────────────────────────────────────────────────────

  test('pedido con hijos', async ({ page }) => {
    test.setTimeout(120000)
    await loginAs(page, 'admin')

    const cliente = await createCliente(page)
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.cliente.id,
      canal: 'PUNTO',
      entregado: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 3 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 50000 }],
    })
    const pedidoJson = await pedidoRes.json()
    const pedidoId = pedidoJson.pedido?.id || pedidoJson.id

    // Pedido hijo real (nueva demanda con `pedidoOrigenId`), sin cobrar: queda PENDIENTE.
    const hijoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.cliente.id,
      canal: 'DOMICILIO',
      pedidoOrigenId: pedidoId,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [],
    })
    expect(hijoRes.status()).toBe(201)
    const hijoJson = await hijoRes.json()
    const hijoId = hijoJson.pedido?.id || hijoJson.id

    const anularRes = await apiPost(page, `/api/pedidos/${pedidoId}/anular`, {
      motivo: 'Test cascade',
      devolverStock: false,
    })

    // Decisión PO (#367): anular un pedido anula también sus hijos.
    expect(anularRes.status()).toBe(200)
    const anularBody = await anularRes.json()
    expect(anularBody.hijosAnulados).toBe(1)

    const padre = await prisma.pedido.findUnique({ where: { id: pedidoId } })
    const hijo = await prisma.pedido.findUnique({ where: { id: hijoId } })
    expect(padre?.estadoEntrega).toBe('ANULADO')
    // El hijo no estaba entregado: el dominio lo cancela (solo se anulan ENTREGADOS).
    expect(hijo?.estadoEntrega).toBe('CANCELADO')
  })
})
