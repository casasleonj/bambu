import { test, expect, fullLogin, apiPost, apiGet, createCliente, resetDatabase } from './fixtures'

test.describe('Pedidos: factura en detalle', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: {} })

  test.beforeAll(() => {
    resetDatabase()
  })

  test('GET /api/pedidos/[id] incluye factura cuando existe', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page)
    const create = await apiPost(page, '/api/pedidos', {
      clienteId: c.cliente.id,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    expect(create.status()).toBeLessThan(500)
    const createBody = await create.json()
    const pedidoId = createBody.pedido?.id || createBody.data?.id
    expect(pedidoId).toBeDefined()

    const detail = await apiGet(page, `/api/pedidos/${pedidoId}`)
    const detailBody = await detail.json()
    expect(detailBody.pedido).toBeDefined()
    expect(detailBody.pedido).toHaveProperty('factura')
  })
})
