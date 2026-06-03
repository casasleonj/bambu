/**
 * Full-flow offline-resilience E2E test.
 *
 * Valida el ciclo completo:
 *   1. Red caída (aborta /api/pedidos) → fetchResilient encola en requestQueue.
 *   2. requestQueue tiene el item con el offlineId correcto.
 *   3. Red restaurada (unroute) + syncWithServer() → requestQueue se vacía.
 *   4. El pedido existe en el server (verificable vía API).
 *
 * Usa window.__bambu (expuesto por ConnectivityIndicator en modo test).
 */

import { test, expect, fullLogin, createCliente } from './fixtures'

test.describe('Full-flow offline-resilience (abort → enqueue → drain)', () => {

  test('abort → enqueue → reconnect → drain: pedido llega al server con mismo offlineId', async ({ page }) => {
    await fullLogin(page)

    // Setup: cliente y limpiamos cualquier cola residual
    const c = await createCliente(page)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }

    // Esperar a que ConnectivityIndicator monte y exponga window.__bambu
    await page.waitForFunction(() => (window as any).__bambu !== undefined, { timeout: 10000 })
    await page.evaluate(() => (window as any).__bambu.clearQueues())

    // Snapshot del conteo de pedidos ANTES de cualquier acción
    const countBefore = await page.evaluate(async () => {
      const res = await fetch('/api/pedidos?limit=1&all=true', { credentials: 'include' })
      const data = await res.json()
      return data.total ?? 0
    })

    // ── 1. Bloquear /api/pedidos ──────────────────────────────────────────
    await page.route('**/api/pedidos', (route) => {
      if (route.request().method() === 'POST') {
        return route.abort('failed')
      }
      return route.continue()
    })

    // ── 2. POST offline (el navegador ve AbortError → encola) ────────────
    const offlineId = crypto.randomUUID()
    const offlineResult = await page.evaluate(
      async ({ url, offlineId, clienteId }) => {
        const bambú = (window as any).__bambu
        return await bambú.fetchResilient(url, {
          method: 'POST',
          body: {
            clienteId,
            canal: 'PUNTO',
            ventaRapida: true,
            items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
            offlineId,
          },
          localEndpoint: 'crear-pedido',
        })
      },
      { url: '/api/pedidos', offlineId, clienteId }
    )

    // Verificar respuesta offline
    expect(offlineResult.status).toBe('offline')

    // ── 3. Verificar que el item está en requestQueue ─────────────────────
    const queueAfterAbort = await page.evaluate(() => (window as any).__bambu.getRequestQueue())
    expect(queueAfterAbort).toHaveLength(1)
    expect(queueAfterAbort[0].offlineId).toBe(offlineId)
    expect(queueAfterAbort[0].method).toBe('POST')
    expect(queueAfterAbort[0].url).toContain('/api/pedidos')

    // ── 4. Restaurar red ──────────────────────────────────────────────────
    await page.unroute('**/api/pedidos')

    // ── 5. Disparar sync (drenar la cola) ─────────────────────────────────
    const syncResult = await page.evaluate(() => (window as any).__bambu.syncWithServer())
    expect(syncResult.synced).toBeGreaterThanOrEqual(1)
    expect(syncResult.failed).toBe(0)

    // ── 6. Verificar que la cola está vacía ───────────────────────────────
    const queueAfterDrain = await page.evaluate(() => (window as any).__bambu.getRequestQueue())
    expect(queueAfterDrain).toHaveLength(0)

    // ── 7. Verificar que el pedido EXISTE en el server ────────────────────
    // El server persiste Pedido.offlineId. Usamos un endpoint admin o consulta directa.
    // Más simple: contar el total de pedidos antes/después.
    // (Ya verificado en countBefore/countAfter arriba.)

    // Conteo de pedidos debe haber crecido
    const countAfter = await page.evaluate(async () => {
      const res = await fetch('/api/pedidos?limit=1&all=true', { credentials: 'include' })
      const data = await res.json()
      return data.total ?? 0
    })
    expect(countAfter).toBe(countBefore + 1)
  })

  test('Doble sync con mismo offlineId → server deduplica (no se duplica)', async ({ page }) => {
    await fullLogin(page)

    const c = await createCliente(page)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }

    await page.waitForFunction(() => (window as any).__bambu !== undefined, { timeout: 10000 })
    await page.evaluate(() => (window as any).__bambu.clearQueues())

    // Bloquear /api/pedidos
    await page.route('**/api/pedidos', (route) => {
      if (route.request().method() === 'POST') return route.abort('failed')
      return route.continue()
    })

    const offlineId = crypto.randomUUID()

    // Capturar total ANTES
    const totalBefore = await page.evaluate(async () => {
      const res = await fetch('/api/pedidos?limit=1&all=true', { credentials: 'include' })
      const data = await res.json()
      return data.total ?? 0
    })

    // Encolar DOS veces con mismo offlineId (simular dos reintentos)
    for (let i = 0; i < 2; i++) {
      const result = await page.evaluate(
        async ({ url, offlineId, clienteId }) => {
          return await (window as any).__bambu.fetchResilient(url, {
            method: 'POST',
            body: {
              clienteId,
              canal: 'PUNTO',
              ventaRapida: true,
              items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
              offlineId,
            },
            localEndpoint: 'crear-pedido',
          })
        },
        { url: '/api/pedidos', offlineId, clienteId }
      )
      expect(result.status).toBe('offline')
    }

    // Ambos encolados (Dexie no deduplica — eso lo hace el server)
    const queueFull = await page.evaluate(() => (window as any).__bambu.getRequestQueue())
    expect(queueFull).toHaveLength(2)
    expect(queueFull.every((q: any) => q.offlineId === offlineId)).toBe(true)

    // Restaurar red y sincronizar
    await page.unroute('**/api/pedidos')
    const syncResult = await page.evaluate(() => (window as any).__bambu.syncWithServer())

    // sync puede reportar 1 synced (200) + 1 conflict (409 dedup) — ambos OK
    expect(syncResult.synced + syncResult.conflicts).toBeGreaterThanOrEqual(1)
    expect(syncResult.failed).toBe(0)

    // Cola vacía
    const queueAfterDrain = await page.evaluate(() => (window as any).__bambu.getRequestQueue())
    expect(queueAfterDrain).toHaveLength(0)

    // Solo UN pedido creado en el server (dedup funcionó)
    // Contamos antes y después para verificar que solo se creó UNO.
    const totalAfter = await page.evaluate(async () => {
      const res = await fetch('/api/pedidos?limit=1&all=true', { credentials: 'include' })
      const data = await res.json()
      return data.total ?? 0
    })
    expect(totalAfter - totalBefore).toBe(1) // Solo se creó UNO
  })

  test('Item con error 4xx NO se reencola (sólo errores de red)', async ({ page }) => {
    await fullLogin(page)

    const c = await createCliente(page)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }

    await page.waitForFunction(() => (window as any).__bambu !== undefined, { timeout: 10000 })
    await page.evaluate(() => (window as any).__bambu.clearQueues())

    // Responder con 400 Bad Request (error de lógica, no de red)
    await page.route('**/api/pedidos', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 400,
          body: JSON.stringify({ error: 'Bad request' }),
        })
      }
      return route.continue()
    })

    const offlineId = crypto.randomUUID()
    const result = await page.evaluate(
      async ({ url, offlineId, clienteId }) => {
        return await (window as any).__bambu.fetchResilient(url, {
          method: 'POST',
          body: {
            clienteId,
            canal: 'PUNTO',
            ventaRapida: true,
            items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
            offlineId,
          },
          localEndpoint: 'crear-pedido',
        })
      },
      { url: '/api/pedidos', offlineId, clienteId }
    )

    // 4xx → status: 'error' (no 'offline')
    expect(result.status).toBe('error')

    // Y la cola NO debe tener el item (errores lógicos no se reencolan)
    const queue = await page.evaluate(() => (window as any).__bambu.getRequestQueue())
    expect(queue).toHaveLength(0)

    await page.unroute('**/api/pedidos')
  })
})
