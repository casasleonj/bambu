// @tests ADR-MONETARIO-002 §1 (épica #447, Fase D) — corrección de precio con recálculo, por la API real.
import { test, expect, loginAs, apiPost, createCliente, BASE } from './fixtures'
import type { Page } from '@playwright/test'

async function crearPedido(page: Page) {
  const c = await createCliente(page)
  const clienteId = c.cliente?.id || c.data?.id
  expect(clienteId, 'cliente creado').toBeTruthy()
  const res = await apiPost(page, '/api/pedidos', {
    clienteId, canal: 'DOMICILIO', ventaRapida: false, items: [{ producto: 'PACA_AGUA', cantidad: 4 }],
  })
  const body = await res.json()
  const pedido = body.pedido ?? body.data
  expect(pedido?.id, 'pedido creado').toBeTruthy()
  return { id: pedido.id as string, total: Number(pedido.total) }
}

async function leerPedido(page: Page, id: string) {
  const r = await page.request.get(`${BASE}/api/pedidos/${id}`)
  const b = await r.json()
  const p = b.pedido ?? b.data
  return { total: Number(p.total), saldo: Number(p.saldo) }
}

test.describe('Corrección de precio (ADR-MONETARIO-002 §1)', () => {
  test('el ADMIN corrige el precio de una línea y el total y el saldo se recalculan', async ({ page }) => {
    await loginAs(page, 'admin')
    const p = await crearPedido(page)

    const res = await apiPost(page, `/api/pedidos/${p.id}/corregir-precio`, {
      producto: 'PACA_AGUA', precioNuevo: 2000, motivo: 'precio acordado con el cliente',
    })
    expect(res.status()).toBe(201)
    const r = await res.json()
    expect(r.estado).toBe('APLICADA')
    expect(r.totalAntes).toBe(p.total)
    expect(r.totalDespues).toBe(8000) // 4 × $2.000

    const despues = await leerPedido(page, p.id)
    expect(despues.total).toBe(8000)
    expect(despues.saldo).toBe(8000)

    const hist = await (await page.request.get(`${BASE}/api/pedidos/${p.id}/correcciones-precio`)).json()
    expect(hist.correcciones).toHaveLength(1)
    expect(hist.correcciones[0]).toMatchObject({ estado: 'APLICADA', precioNuevo: 2000, motivo: 'precio acordado con el cliente' })
  })

  test('sin motivo o con precio 0 se rechaza y el pedido no cambia', async ({ page }) => {
    await loginAs(page, 'admin')
    const p = await crearPedido(page)
    const sinMotivo = await apiPost(page, `/api/pedidos/${p.id}/corregir-precio`, { producto: 'PACA_AGUA', precioNuevo: 2000, motivo: ' ' })
    expect(sinMotivo.status()).toBe(400)
    const precioCero = await apiPost(page, `/api/pedidos/${p.id}/corregir-precio`, { producto: 'PACA_AGUA', precioNuevo: 0, motivo: 'x y z' })
    expect(precioCero.status()).toBe(400)
    expect((await leerPedido(page, p.id)).total).toBe(p.total)
  })

  test('el ASISTENTE solo solicita: queda PENDIENTE y el total no cambia', async ({ page }) => {
    await loginAs(page, 'asistente')
    const p = await crearPedido(page)
    const res = await apiPost(page, `/api/pedidos/${p.id}/corregir-precio`, {
      producto: 'PACA_AGUA', precioNuevo: 2000, motivo: 'el cliente reclama',
    })
    expect(res.status()).toBe(201)
    expect((await res.json()).estado).toBe('PENDIENTE')
    expect((await leerPedido(page, p.id)).total).toBe(p.total)
    // y no puede resolverla
    const sol = (await (await page.request.get(`${BASE}/api/pedidos/${p.id}/correcciones-precio`)).json()).correcciones[0]
    const resolver = await page.request.patch(`${BASE}/api/pedidos/correcciones-precio/${sol.id}`, {
      data: { resolucion: 'AUTORIZAR' },
    })
    expect(resolver.status()).toBe(403)
  })
})
