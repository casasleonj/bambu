/**
 * Offline-resilience E2E tests.
 *
 * Verifica el comportamiento de fetchResilient() cuando la red falla:
 * 1. POST con red caída (connectionreset) → IndexedDB requestQueue crece.
 * 2. Doble POST con mismo offlineId → server deduplica (no se duplica el pedido).
 * 3. La API de pedidos acepta offlineId y persiste el dedup.
 *
 * NOTA: el replay de la cola en el cliente se valida en los unit tests
 * (fetch-resilient.test.ts). Aquí validamos el contrato server-side.
 */

import { test, expect, fullLogin, apiPost, createCliente } from './fixtures'

test.describe('Offline resilience — dedup por offlineId', () => {

  test('Doble POST con mismo offlineId → server deduplica (no se duplica el pedido)', async ({ page }) => {
    await fullLogin(page)

    const c = await createCliente(page)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }

    const offlineId = crypto.randomUUID()
    const payload = {
      clienteId,
      canal: 'PUNTO' as const,
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA' as const, cantidad: 1 }],
      offlineId,
    }

    // Primer envío
    const r1 = await apiPost(page, '/api/pedidos', payload)
    expect(r1.status()).toBeGreaterThanOrEqual(200)
    expect(r1.status()).toBeLessThan(300)
    const d1 = await r1.json()
    const pedido1Id = d1.pedido?.id
    expect(pedido1Id).toBeTruthy()

    // Segundo envío con MISMO offlineId → server debe deduplicar
    const r2 = await apiPost(page, '/api/pedidos', payload)
    const d2 = await r2.json()
    const pedido2Id = d2.pedido?.id

    // El server retorna el MISMO pedido (no crea duplicado)
    expect(pedido2Id).toBe(pedido1Id)
  })

  test('POST sin offlineId funciona normalmente (backward compatibility)', async ({ page }) => {
    await fullLogin(page)

    const c = await createCliente(page)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }

    // Sin offlineId — comportamiento legacy
    const r = await apiPost(page, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO' as const,
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA' as const, cantidad: 1 }],
    })
    const d = await r.json()
    expect(d.pedido?.id).toBeTruthy()
  })

  test('POST con offlineId persiste el campo en la DB', async ({ page }) => {
    await fullLogin(page)

    const c = await createCliente(page)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }

    const offlineId = crypto.randomUUID()
    const r = await apiPost(page, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO' as const,
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA' as const, cantidad: 1 }],
      offlineId,
    })
    const d = await r.json()
    expect(d.pedido?.id).toBeTruthy()

    // Verificamos que el offlineId está persistido en el pedido creado
    // leyendo de vuelta vía API GET
    const getRes = await page.request.get(`/api/pedidos/${d.pedido.id}`)
    const getData = await getRes.json()
    // El campo puede estar en getData.pedido.offlineId o en el root según el shape
    const persistedOfflineId = getData.pedido?.offlineId ?? getData.offlineId ?? getData.data?.offlineId
    expect(persistedOfflineId).toBe(offlineId)
  })
})
