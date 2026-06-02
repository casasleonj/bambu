/**
 * Offline-resilience E2E tests for Operaciones (Phase 3).
 *
 * Cubre:
 * 1. PUT /api/embarques/[id] con mismo offlineId → server deduplica (no re-asigna pedidos)
 * 2. DELETE /api/embarques/[id] idempotente — segundo cancel retorna deduped:true
 * 3. PUT /api/embarques/[id] sin offlineId funciona normalmente (backward compat)
 */

import { test, expect, fullLogin, apiPost, apiPut, apiDelete, createTrabajador, createCliente } from './fixtures'

test.describe('Offline resilience — Operaciones dedup', () => {

  test('PUT /api/embarques/[id] con mismo offlineId → server deduplica', async ({ page }) => {
    await fullLogin(page)

    // Setup: crear trabajador, cliente, embarque y pedido pendiente
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    const c = await createCliente(page)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }

    // Crear embarque
    const eRes = await apiPost(page, '/api/embarques', {
      trabajadorId,
      horaSalida: '08:00',
      carga: [{ producto: 'PACA_AGUA', cargadas: 10 }],
    })
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    if (!embarqueId) { test.skip(); return }

    // Crear pedido pendiente
    const pRes = await apiPost(page, '/api/pedidos', {
      clienteId, canal: 'DOMICILIO', ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    const pData = await pRes.json()
    const pedidoId = pData.pedido?.id || pData.data?.id
    if (!pedidoId) { test.skip(); return }

    const offlineId = crypto.randomUUID()
    const payload = { pedidoIds: [pedidoId], offlineId }

    // Primer PUT
    const r1 = await apiPut(page, `/api/embarques/${embarqueId}`, payload)
    expect(r1.status()).toBeGreaterThanOrEqual(200)
    expect(r1.status()).toBeLessThan(300)

    // Segundo PUT con MISMO offlineId → server debe deduplicar
    const r2 = await apiPut(page, `/api/embarques/${embarqueId}`, payload)
    const d2 = await r2.json()

    // El response debe indicar dedup (mismo offlineId persistido)
    expect(d2.deduped).toBe(true)
  })

  test('DELETE /api/embarques/[id] es idempotente (segundo cancel retorna deduped:true)', async ({ page }) => {
    await fullLogin(page)

    // Setup: crear embarque
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }

    const eRes = await apiPost(page, '/api/embarques', {
      trabajadorId,
      horaSalida: '08:00',
      carga: [{ producto: 'PACA_AGUA', cargadas: 5 }],
    })
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    if (!embarqueId) { test.skip(); return }

    // Primer DELETE
    const r1 = await apiDelete(page, `/api/embarques/${embarqueId}`)
    expect(r1.status()).toBeGreaterThanOrEqual(200)
    expect(r1.status()).toBeLessThan(300)

    // Segundo DELETE → server debe retornar deduped:true
    const r2 = await apiDelete(page, `/api/embarques/${embarqueId}`)
    const d2 = await r2.json()

    // El segundo debe indicar que ya estaba cancelado
    expect(d2.deduped).toBe(true)
  })

  test('PUT /api/embarques/[id] sin offlineId funciona normalmente (backward compat)', async ({ page }) => {
    await fullLogin(page)

    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    const c = await createCliente(page)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }

    const eRes = await apiPost(page, '/api/embarques', {
      trabajadorId,
      horaSalida: '08:00',
      carga: [{ producto: 'PACA_AGUA', cargadas: 5 }],
    })
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    if (!embarqueId) { test.skip(); return }

    const pRes = await apiPost(page, '/api/pedidos', {
      clienteId, canal: 'DOMICILIO', ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    const pData = await pRes.json()
    const pedidoId = pData.pedido?.id || pData.data?.id
    if (!pedidoId) { test.skip(); return }

    // Sin offlineId — comportamiento legacy
    const r = await apiPut(page, `/api/embarques/${embarqueId}`, {
      pedidoIds: [pedidoId],
    })
    expect(r.status()).toBeGreaterThanOrEqual(200)
    expect(r.status()).toBeLessThan(300)
    const d = await r.json()
    expect(d.success).toBe(true)
  })
})
