import { test, expect, type Page } from '@playwright/test'
import {fullLogin, createCliente, apiPost, apiPut, apiGet, resetDatabase} from './fixtures'

async function createPedidoFiado(page: Page, clienteId: string, ventaRapida = false) {
  return apiPost(page, '/api/pedidos', {
    clienteId,
    canal: 'DOMICILIO',
    ventaRapida,
    items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    pagos: [],
  })
}

async function setLimiteGlobal(page: Page, valor: number) {
  return apiPost(page, '/api/config', { clave: 'LIMITE_PEDIDOS_FIADOS_DEFAULT', valor: String(valor) })
}

test.describe.configure({ mode: 'serial' })

test.describe('Fiados - límite global y criterio de pedido fiado', () => {
  test.beforeAll(() => {
    resetDatabase()
  })

  test.beforeEach(async ({ page }) => {
    await fullLogin(page)
  })

  test('pedido PENDIENTE no entregado NO cuenta para el límite de fiados', async ({ page }) => {
    const cliente = await createCliente(page, { nombre: 'Cliente Pendiente No Cuenta' })
    const clienteId = cliente.id

    // 1. Crear pedido PENDIENTE (no venta rápida) → queda fiado pero no entregado
    const p1 = await (await createPedidoFiado(page, clienteId, false)).json()
    expect(p1.pedido.estadoEntrega).toBe('PENDIENTE')
    expect(Number(p1.pedido.saldo)).toBeGreaterThan(0)

    // 2. Debe poder crear otro pedido porque el primero no está ENTREGADO
    const p2 = await createPedidoFiado(page, clienteId, false)
    expect(p2.status()).toBe(201)
  })

  test('límite global LIMITE_PEDIDOS_FIADOS_DEFAULT se respeta', async ({ page }) => {
    await setLimiteGlobal(page, 1)
    const cliente = await createCliente(page, { nombre: 'Cliente Limite Global 1' })
    const clienteId = cliente.id

    // 1. Primer pedido fiado entregado (venta rápida) → OK
    const p1 = await createPedidoFiado(page, clienteId, true)
    expect(p1.status()).toBe(201)

    // 2. Segundo pedido fiado debe bloquearse por límite global = 1
    const p2 = await createPedidoFiado(page, clienteId, true)
    expect(p2.status()).toBe(400)
    const body = await p2.json()
    expect(body.error?.message || body.error || body.message || '').toMatch(/límite: 1/i)
  })

  test('límite personal por cliente tiene prioridad sobre el global', async ({ page }) => {
    await setLimiteGlobal(page, 1)
    const cliente = await createCliente(page, { nombre: 'Cliente Limite Personal 2' })
    const clienteId = cliente.id

    // Actualizar límite personal a 2 (global es 1)
    await apiPut(page, `/api/clientes/${clienteId}`, {
      limitePedidosFiados: 2,
    })

    // 1. Primer pedido fiado entregado → OK
    const p1 = await createPedidoFiado(page, clienteId, true)
    expect(p1.status()).toBe(201)

    // 2. Segundo pedido fiado entregado → OK (límite personal = 2)
    const p2 = await createPedidoFiado(page, clienteId, true)
    expect(p2.status()).toBe(201)

    // 3. Tercer pedido fiado debe bloquearse
    const p3 = await createPedidoFiado(page, clienteId, true)
    expect(p3.status()).toBe(400)
    const body = await p3.json()
    expect(body.error?.message || body.error || body.message || '').toMatch(/límite: 2/i)
  })

  test('saldoPendiente del cliente solo incluye pedidos ENTREGADOS fiados', async ({ page }) => {
    const unique = Date.now()
    const cliente = await createCliente(page, { nombre: `Cliente Saldo Pendiente ${unique}` })
    const clienteId = cliente.id

    // 1. Crear pedido PENDIENTE (no entregado) fiado
    const p1 = await (await createPedidoFiado(page, clienteId, false)).json()
    expect(p1.pedido.estadoEntrega).toBe('PENDIENTE')

    // 2. El saldoPendiente en el detalle debe ser 0
    const res = await apiGet(page, `/api/clientes/${clienteId}`)
    const body = await res.json()
    const saldoDetalle = body.cliente?.saldoPendiente ?? body.data?.cliente?.saldoPendiente ?? -1
    expect(Number(saldoDetalle)).toBe(0)

    // 3. El saldoPendiente en el listado también debe ser 0
    const listRes = await apiGet(page, `/api/clientes?search=${encodeURIComponent(String(unique))}`)
    const listBody = await listRes.json()
    const fromList = listBody.clientes?.find((c: { id: string }) => c.id === clienteId)
    expect(fromList).toBeTruthy()
    expect(Number(fromList.saldoPendiente || 0)).toBe(0)

    // 4. Crear un pedido ENTREGADO fiado
    const p2 = await createPedidoFiado(page, clienteId, true)
    expect(p2.status()).toBe(201)

    // 5. Ahora el saldoPendiente debe ser > 0 en ambos endpoints
    const res2 = await apiGet(page, `/api/clientes/${clienteId}`)
    const body2 = await res2.json()
    const saldoDetalle2 = body2.cliente?.saldoPendiente ?? body2.data?.cliente?.saldoPendiente ?? 0
    expect(Number(saldoDetalle2)).toBeGreaterThan(0)

    const listRes2 = await apiGet(page, `/api/clientes?search=${encodeURIComponent(String(unique))}`)
    const listBody2 = await listRes2.json()
    const fromList2 = listBody2.clientes?.find((c: { id: string }) => c.id === clienteId)
    expect(fromList2).toBeTruthy()
    expect(Number(fromList2.saldoPendiente || 0)).toBeGreaterThan(0)
  })
})
