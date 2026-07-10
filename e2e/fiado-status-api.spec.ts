import { test, expect, type Page } from '@playwright/test'
import { fullLogin, createCliente, apiPost, apiGet, apiPut, resetDatabase } from './fixtures'

async function createPedidoEntregado(page: Page, clienteId: string, cantidad = 1) {
  return apiPost(page, '/api/pedidos', {
    clienteId,
    canal: 'DOMICILIO',
    ventaRapida: true,
    items: [{ producto: 'PACA_AGUA', cantidad }],
    pagos: [],
  })
}

test.describe.configure({ mode: 'serial' })

test.describe('API /api/clientes/[id]/fiado-status', () => {
  test.beforeAll(() => {
    resetDatabase()
  })

  test.beforeEach(async ({ page }) => {
    await fullLogin(page)
  })

  test('cliente sin pedidos fiados reporta 0/2 ok', async ({ page }) => {
    const cliente = await createCliente(page, { nombre: 'Karina Sin Pedidos' })
    await apiPut(page, `/api/clientes/${cliente.cliente.id}`, { limitePedidosFiados: 2 })

    const res = await apiGet(page, `/api/clientes/${cliente.cliente.id}/fiado-status`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.status).toMatchObject({
      count: 0,
      limite: 2,
      nivel: 'ok',
    })
    expect(body.status.pedidos).toEqual([])
  })

  test('cliente con 2 pedidos entregados fiados reporta límite alcanzado', async ({ page }) => {
    const cliente = await createCliente(page, { nombre: 'Karina Dos Fiados' })
    const clienteId = cliente.cliente.id
    await apiPut(page, `/api/clientes/${clienteId}`, { limitePedidosFiados: 2 })

    const p1 = await createPedidoEntregado(page, clienteId, 1)
    expect(p1.status()).toBe(201)
    const p2 = await createPedidoEntregado(page, clienteId, 1)
    expect(p2.status()).toBe(201)

    const res = await apiGet(page, `/api/clientes/${clienteId}/fiado-status`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.status).toMatchObject({
      count: 2,
      limite: 2,
      nivel: 'limite',
    })
    expect(body.status.pedidos).toHaveLength(2)
  })

  test('pedido PENDIENTE no entregado no cuenta para el estado de fiado', async ({ page }) => {
    const cliente = await createCliente(page, { nombre: 'Karina Pendiente No Cuenta' })
    const clienteId = cliente.cliente.id
    await apiPut(page, `/api/clientes/${clienteId}`, { limitePedidosFiados: 1 })

    const p1 = await apiPost(page, '/api/pedidos', {
      clienteId,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [],
    })
    expect(p1.status()).toBe(201)

    const res = await apiGet(page, `/api/clientes/${clienteId}/fiado-status`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.status).toMatchObject({ count: 0, nivel: 'ok' })
    expect(body.status.pedidos).toEqual([])
  })

  test('cliente inexistente retorna 404', async ({ page }) => {
    const res = await apiGet(page, '/api/clientes/non-existent-id/fiado-status')
    expect(res.status()).toBe(404)
  })
})
