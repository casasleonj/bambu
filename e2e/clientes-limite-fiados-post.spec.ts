import { test, expect, fullLogin, apiPost, resetDatabase } from './fixtures'

test.describe('Issue cliente limitePedidosFiados', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeAll(() => {
    resetDatabase()
  })

  test('POST /api/clientes persiste limitePedidosFiados y lo devuelve', async ({ page }) => {
    await fullLogin(page)
    const res = await apiPost(page, '/api/clientes', {
      nombre: 'Cliente Límite Test',
      telefono: `3${String(Date.now()).slice(-9)}`,
      limitePedidosFiados: 5,
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.cliente.limitePedidosFiados).toBe(5)
  })

  test('POST /api/clientes sin limitePedidosFiados lo guarda como null', async ({ page }) => {
    await fullLogin(page)
    const res = await apiPost(page, '/api/clientes', {
      nombre: 'Cliente Sin Límite Test',
      telefono: `3${String(Date.now() + 1).slice(-9)}`,
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.cliente.limitePedidosFiados).toBeNull()
  })
})
