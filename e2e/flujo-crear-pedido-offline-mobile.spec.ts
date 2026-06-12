// @tests H3-1: Crear pedido offline → reconectar → sync (móvil)
// Vector: offline/sync — el más crítico para repartidores en zonas rurales.
// Verifica en viewport iPhone 13:
//   1. POST /api/pedidos con red caída → encola en requestQueue (Dexie)
//   2. La cola tiene 1 item con el offlineId correcto
//   3. Restaurar red + sync → la cola se vacía
//   4. El pedido existe en el server (1 fila, sin duplicar)
import { test, expect } from '@playwright/test'
import { fullLogin, createCliente, BASE } from './fixtures'

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 3,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Mobile/15E148 Safari/604.1',
})

test.describe('H3-1: Pedido offline → reconectar → sync (iPhone 13)', () => {
  // CORRER EN SERIAL: los 2 tests modifican el conteo de pedidos
  // (insertan en server). En paralelo, ambos leen el mismo countBefore
  // y verifican countBefore+1, lo que causa falla por interferencia.
  test.describe.configure({ mode: 'serial' })

  test('pedido creado offline llega al server sin duplicar cuando se restaura la red', async ({ page }) => {
    await fullLogin(page)

    // 1. Crear cliente vía API para tener con qué trabajar
    const c = await createCliente(page, { nombre: 'Test Offline Mobile' })
    const clienteId = c.cliente?.id || c.data?.id
    expect(clienteId).toBeTruthy()

    // 2. Esperar a que ConnectivityIndicator monte
    await page.waitForFunction(() => (window as any).__bambu !== undefined, { timeout: 10000 })
    await page.evaluate(() => (window as any).__bambu.clearQueues())

    // 3. Snapshot del conteo de pedidos ANTES
    const countBefore = await page.evaluate(async () => {
      const res = await fetch('/api/pedidos?all=true&pageSize=1', { credentials: 'include' })
      const data = await res.json()
      return data.total ?? 0
    })

    // 4. Bloquear SOLO los POST a /api/pedidos (simular "red caída" para
    //    ese endpoint, sin matar el resto de la página que sigue
    //    funcionando en el browser)
    await page.route('**/api/pedidos', (route) => {
      if (route.request().method() === 'POST') {
        return route.abort('failed')
      }
      return route.continue()
    })

    // 5. POST offline: debe encolarse en Dexie
    const offlineId = crypto.randomUUID()
    const offlineResult = await page.evaluate(
      async ({ url, offlineId, clienteId }) => {
        const api = (window as any).__bambu
        return await api.fetchResilient(url, {
          method: 'POST',
          body: {
            clienteId,
            canal: 'PUNTO',
            ventaRapida: true,
            items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
            offlineId,
          },
          localEndpoint: 'crear-pedido-mobile-h3-1',
        })
      },
      { url: `${BASE}/api/pedidos`, offlineId, clienteId },
    )

    // Debe retornar status='offline' (no 'ok' ni 'error')
    expect(offlineResult.status).toBe('offline')

    // 6. Verificar que la cola tiene el item
    const queueAfterAbort = await page.evaluate(() => (window as any).__bambu.getRequestQueue())
    expect(queueAfterAbort.length).toBe(1)
    expect(queueAfterAbort[0].offlineId).toBe(offlineId)
    expect(queueAfterAbort[0].method).toBe('POST')
    expect(queueAfterAbort[0].url).toContain('/api/pedidos')

    // 7. Restaurar la red (desbloquear /api/pedidos)
    await page.unroute('**/api/pedidos')

    // 8. Sincronizar
    const syncResult = await page.evaluate(() => (window as any).__bambu.syncWithServer())
    // Verificamos que al menos 1 item se sincronizó y 0 fallaron
    // (conflict puede no estar en el resultado, no asumimos su presencia)
    expect(syncResult.synced).toBeGreaterThanOrEqual(1)
    expect(syncResult.failed).toBe(0)

    // 9. La cola debe estar vacía
    const queueAfterDrain = await page.evaluate(() => (window as any).__bambu.getRequestQueue())
    expect(queueAfterDrain.length).toBe(0)

    // 10. El pedido debe existir en el server (1 fila, no más)
    const countAfter = await page.evaluate(async () => {
      const res = await fetch('/api/pedidos?all=true&pageSize=1', { credentials: 'include' })
      const data = await res.json()
      return data.total ?? 0
    })
    expect(countAfter).toBe(countBefore + 1)
  })

  test('doble clic offline (mismo offlineId × 2) crea 1 solo pedido', async ({ page }) => {
    await fullLogin(page)

    const c = await createCliente(page, { nombre: 'Test Dedup Mobile' })
    const clienteId = c.cliente?.id || c.data?.id
    expect(clienteId).toBeTruthy()

    await page.waitForFunction(() => (window as any).__bambu !== undefined, { timeout: 10000 })
    await page.evaluate(() => (window as any).__bambu.clearQueues())

    const countBefore = await page.evaluate(async () => {
      const res = await fetch('/api/pedidos?all=true&pageSize=1', { credentials: 'include' })
      const data = await res.json()
      return data.total ?? 0
    })

    await page.route('**/api/pedidos', (route) => {
      if (route.request().method() === 'POST') {
        return route.abort('failed')
      }
      return route.continue()
    })
    const offlineId = crypto.randomUUID()

    // Dos POSTs con el mismo offlineId mientras está offline
    const r1 = await page.evaluate(
      async ({ url, offlineId, clienteId }) => {
        return await (window as any).__bambu.fetchResilient(url, {
          method: 'POST',
          body: {
            clienteId, canal: 'PUNTO', ventaRapida: true,
            items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
            offlineId,
          },
          localEndpoint: 'crear-pedido-mobile-h3-1-dup1',
        })
      },
      { url: `${BASE}/api/pedidos`, offlineId, clienteId },
    )
    const r2 = await page.evaluate(
      async ({ url, offlineId, clienteId }) => {
        return await (window as any).__bambu.fetchResilient(url, {
          method: 'POST',
          body: {
            clienteId, canal: 'PUNTO', ventaRapida: true,
            items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
            offlineId,
          },
          localEndpoint: 'crear-pedido-mobile-h3-1-dup2',
        })
      },
      { url: `${BASE}/api/pedidos`, offlineId, clienteId },
    )

    // Ambos deben retornar status='offline' (la red está caída)
    expect(r1.status).toBe('offline')
    expect(r2.status).toBe('offline')

    // La cola debe tener 2 items (el offlineId está en el body, no es
    // dedup en cliente — la dedup real se hace en server al sincronizar)
    const queue = await page.evaluate(() => (window as any).__bambu.getRequestQueue())
    expect(queue.length).toBe(2)

    await page.unroute('**/api/pedidos')
    // Pequeña espera para que el navegador registre el evento online
    await page.waitForTimeout(500)
    const syncResult = await page.evaluate(async () => {
      // Forzar sync (normalmente el ConnectivityIndicator lo hace solo,
      // pero acá lo disparamos manualmente para que el test sea determinista)
      return await (window as any).__bambu.syncWithServer()
    })
    // synced puede ser 1 (uno se creó) y conflict 1 (el otro fue rechazado por P2002/offlineId)
    // O ambos sync OK y el server dedupea el segundo
    // Lo importante: NO más de 1 pedido nuevo
    const created = (syncResult.synced ?? 0) + (syncResult.conflict ?? 0)
    expect(created).toBe(2)

    const countAfter = await page.evaluate(async () => {
      const res = await fetch('/api/pedidos?all=true&pageSize=1', { credentials: 'include' })
      const data = await res.json()
      return data.total ?? 0
    })
    // Después de sync, solo 1 pedido nuevo (el server dedupea)
    expect(countAfter).toBe(countBefore + 1)
  })
})
