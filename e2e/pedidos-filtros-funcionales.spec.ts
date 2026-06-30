import { test, expect, fullLogin, apiPost, apiGet, createCliente, resetDatabase } from './fixtures'

test.describe('Pedidos: filtros backend funcionan', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: {} })

  test.beforeAll(() => {
    resetDatabase()
  })

  test('filtro tipo=ENVIO solo devuelve pedidos DOMICILIO', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page)

    await apiPost(page, '/api/pedidos', {
      clienteId: c.cliente.id,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
    })

    await apiPost(page, '/api/pedidos', {
      clienteId: c.cliente.id,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })

    const res = await apiGet(page, '/api/pedidos?all=true&tipo=ENVIO')
    const body = await res.json()
    expect(body.pedidos.length).toBeGreaterThanOrEqual(1)
    expect(body.pedidos.every((p: { tipo: string }) => p.tipo === 'ENVIO')).toBe(true)
  })

  test('filtro estadoEntrega=PENDIENTE funciona', async ({ page }) => {
    await fullLogin(page)
    const res = await apiGet(page, '/api/pedidos?all=true&estadoEntrega=PENDIENTE')
    const body = await res.json()
    expect(body.pedidos.every((p: { estadoEntrega: string }) => p.estadoEntrega === 'PENDIENTE')).toBe(true)
  })

  test('filtro estadoPago=PENDIENTE funciona', async ({ page }) => {
    await fullLogin(page)
    const res = await apiGet(page, '/api/pedidos?all=true&estadoPago=PENDIENTE')
    const body = await res.json()
    expect(body.pedidos.every((p: { estadoPago: string }) => p.estadoPago === 'PENDIENTE')).toBe(true)
  })

  test('filtro origen=PEDIDO funciona', async ({ page }) => {
    await fullLogin(page)
    const res = await apiGet(page, '/api/pedidos?all=true&origen=PEDIDO')
    const body = await res.json()
    expect(body.pedidos.every((p: { origen: string }) => p.origen === 'PEDIDO')).toBe(true)
  })
})
