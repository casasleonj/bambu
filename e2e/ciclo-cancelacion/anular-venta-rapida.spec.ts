// @tests C-5: Anular pedido VENTA_RAPIDA debe funcionar
// Reemplaza el `test.skip(true, 'venta rapida flow differs')` en ciclo-cancelacion.spec.ts:45
import { test, expect, fullLogin, apiPost, createCliente, resetTestDatabase } from '../fixtures'

test.describe('Anulación: Venta Rápida (PUNTO + ventaRapida:true)', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(() => {
    resetTestDatabase()
  })

  test('anular venta rápida PUNTO → estado ANULADO', async ({ page }) => {
    test.setTimeout(60000)
    await fullLogin(page)

    // Crear venta rápida en PUNTO
    const cliente = await createCliente(page)
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.cliente.id,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
    })
    expect([200, 201]).toContain(pedidoRes.status())
    const pedidoJson = await pedidoRes.json()
    const pedidoId = pedidoJson.pedido?.id || pedidoJson.id
    expect(pedidoId).toBeTruthy()

    // Anular
    const anularRes = await apiPost(page, `/api/pedidos/${pedidoId}/anular`, {
      motivo: 'Test anulación venta rápida',
      devolverStock: false,
    })

    // No debe ser 400 por "no entregado"
    expect(anularRes.status()).toBe(200)

    const anularBody = await anularRes.json()
    expect(anularBody.pedido.estado || anularBody.estado).toBe('ANULADO')
  })

  test('anular pedido NO_ENTREGADO (no venta rápida) debe fallar', async ({ page }) => {
    await fullLogin(page)

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

    const anularRes = await apiPost(page, `/api/pedidos/${pedidoId}/anular`, {
      motivo: 'Intentar anular pendiente',
      devolverStock: false,
    })

    expect(anularRes.status()).toBe(400)
    const errBody = await anularRes.json()
    const errorMsg = typeof errBody.error === 'string' ? errBody.error : (errBody.error?.message || errBody.message || '')
    expect(errorMsg).toMatch(/ENTREGADO|entregado|SOLO_ENTREGADO/i)
  })
})
