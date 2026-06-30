import { test, expect, fullLogin, apiPost, apiGet, createCliente, resetDatabase } from './fixtures'

test.describe('Pedidos: campo Tipo', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: {} })

  test.beforeAll(() => {
    resetDatabase()
  })

  test('pedido PUNTO tiene tipo=PUNTO en el listado y en detalle', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page)
    const create = await apiPost(page, '/api/pedidos', {
      clienteId: c.cliente.id,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
    })
    expect(create.status()).toBe(201)
    const list = await apiGet(page, '/api/pedidos?all=true')
    const listBody = await list.json()
    const punto = listBody.pedidos.find((p: { tipo: string; canal: string }) => p.canal === 'PUNTO')
    expect(punto).toBeDefined()
    expect(punto.tipo).toBe('PUNTO')

    const detail = await apiGet(page, `/api/pedidos/${punto.id}`)
    const detailBody = await detail.json()
    expect(detailBody.pedido.tipo).toBe('PUNTO')
  })

  test('pedido DOMICILIO tiene tipo=ENVIO en el listado y en detalle', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page)
    const create = await apiPost(page, '/api/pedidos', {
      clienteId: c.cliente.id,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    expect(create.status()).toBeLessThan(500)
    const list = await apiGet(page, '/api/pedidos?all=true')
    const listBody = await list.json()
    const envio = listBody.pedidos.find((p: { tipo: string; canal: string }) => p.canal === 'DOMICILIO')
    expect(envio).toBeDefined()
    expect(envio.tipo).toBe('ENVIO')

    const detail = await apiGet(page, `/api/pedidos/${envio.id}`)
    const detailBody = await detail.json()
    expect(detailBody.pedido.tipo).toBe('ENVIO')
  })
})
