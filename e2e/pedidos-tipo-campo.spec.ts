import { test, expect, loginAs, apiPost, apiGet, createCliente, resetDatabase } from './fixtures'

test.describe('Pedidos: campo canal (reemplaza a tipo, ADR-PEDIDO-ORIGEN-CANAL-001)', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeAll(() => {
    resetDatabase()
  })

  test('pedido PUNTO expone canal=PUNTO en el listado y en detalle, sin campo tipo', async ({ page }) => {
    await loginAs(page, 'admin')
    const c = await createCliente(page)
    const create = await apiPost(page, '/api/pedidos', {
      clienteId: c.cliente.id,
      canal: 'PUNTO',
      entregado: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
    })
    expect(create.status()).toBe(201)
    const list = await apiGet(page, '/api/pedidos?all=true')
    const listBody = await list.json()
    const punto = listBody.pedidos.find((p: { tipo?: string; canal: string }) => p.canal === 'PUNTO')
    expect(punto).toBeDefined()
    expect(punto.canal).toBe('PUNTO')
    expect(punto.tipo).toBeUndefined()

    const detail = await apiGet(page, `/api/pedidos/${punto.id}`)
    const detailBody = await detail.json()
    expect(detailBody.pedido.canal).toBe('PUNTO')
    expect(detailBody.pedido.tipo).toBeUndefined()
  })

  test('pedido DOMICILIO expone canal=DOMICILIO en el listado y en detalle, sin campo tipo', async ({ page }) => {
    await loginAs(page, 'admin')
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
    const envio = listBody.pedidos.find((p: { tipo?: string; canal: string }) => p.canal === 'DOMICILIO')
    expect(envio).toBeDefined()
    expect(envio.canal).toBe('DOMICILIO')
    expect(envio.tipo).toBeUndefined()

    const detail = await apiGet(page, `/api/pedidos/${envio.id}`)
    const detailBody = await detail.json()
    expect(detailBody.pedido.canal).toBe('DOMICILIO')
    expect(detailBody.pedido.tipo).toBeUndefined()
  })
})
