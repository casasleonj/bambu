// @ts-check
// Fase 5: Flujos offline
// C1. Crear pedido offline → encolar en Dexie
// C2. Sync on reconnect → request llega al server
// C3. Dedup: mismo offlineId dos veces → no duplica

import { test, expect, loginAs, shoot, addFinding, isVisible, dbCount, BASE, RUN_ID } from './walkthrough-helpers'

test.describe('Fase 5. Flujos offline', () => {
  test('C1.1: Crear pedido offline → se encola en Dexie', async ({ page, context }) => {
    await loginAs(page, 'admin')

    // Crear cliente primero
    const cliRes = await page.request.post(`${BASE}/api/clientes`, {
      data: { nombre: `C1 Cliente ${Date.now()}`, telefono: `3${String(Date.now()).slice(-9)}`, direccion: 'X', barrio: 'Y' },
    })
    const cliData = await cliRes.json()
    const clienteId = cliData.cliente?.id || cliData.data?.id
    if (!clienteId) { test.skip(); return }

    // Estado inicial de la cola offline (Dexie es client-side)
    const queueSizeAntes = await page.evaluate(async () => {
      const dbs = await indexedDB.databases()
      const bambu = dbs.find(d => d.name?.includes('BambuOffline') || d.name?.includes('offline'))
      if (!bambu) return 0
      return new Promise((resolve) => {
        const req = indexedDB.open(bambu.name)
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('requestQueue')) { resolve(0); return }
          const tx = db.transaction('requestQueue', 'readonly')
          const store = tx.objectStore('requestQueue')
          const countReq = store.count()
          countReq.onsuccess = () => resolve(countReq.result)
          countReq.onerror = () => resolve(0)
        }
        req.onerror = () => resolve(0)
      })
    })

    // Ir a /pedidos y activar modo offline
    await page.goto(`${BASE}/pedidos`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Setear contexto offline ANTES de crear el pedido
    await context.setOffline(true)
    addFinding({ severity: 'P3', module: 'offline', title: 'C1.1: context.setOffline(true)', description: '' })

    // Esperar 1s
    await page.waitForTimeout(1000)

    // Intentar crear un pedido via fetch directamente (lo que hace fetchResilient)
    const pedidoId = await page.evaluate(async (cid) => {
      const offlineId = crypto.randomUUID()
      const body = {
        clienteId: cid,
        canal: 'PUNTO',
        ventaRapida: true,
        items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 3000 }],
        offlineId,
      }
      try {
        const res = await fetch('/api/pedidos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        return { status: res.status, offlineId, body: await res.text().catch(() => '') }
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'unknown', offlineId }
      }
    }, clienteId)

    addFinding({
      severity: 'P3',
      module: 'offline',
      title: `C1.1: Fetch offline result: ${JSON.stringify(pedidoId).slice(0, 200)}`,
      description: '',
    })

    // Verificar si la cola offline tiene el request
    const queueSizeDespues = await page.evaluate(async () => {
      const dbs = await indexedDB.databases()
      const bambu = dbs.find(d => d.name?.includes('BambuOffline') || d.name?.includes('offline'))
      if (!bambu) return -1
      return new Promise((resolve) => {
        const req = indexedDB.open(bambu.name)
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('requestQueue')) { resolve(-1); return }
          const tx = db.transaction('requestQueue', 'readonly')
          const store = tx.objectStore('requestQueue')
          const countReq = store.count()
          countReq.onsuccess = () => resolve(countReq.result)
          countReq.onerror = () => resolve(-2)
        }
        req.onerror = () => resolve(-3)
      })
    })

    addFinding({
      severity: queueSizeDespues > queueSizeAntes ? 'P3' : 'P2',
      module: 'offline',
      title: `C1.1: Dexie requestQueue: antes=${queueSizeAntes}, después=${queueSizeDespues}`,
      description: queueSizeDespues > queueSizeAntes
        ? '✅ El fetch offline se encoló en Dexie. fetchResilient funciona.'
        : '❌ El fetch offline NO se encoló. fetchResilient no se invocó (requiere acción de UI).',
    })

    // Reactivar online
    await context.setOffline(false)
    addFinding({ severity: 'P3', module: 'offline', title: 'C1.1: context.setOffline(false)', description: '' })
  })

  test('C1.2: Sync on reconnect — request offline llega al server', async ({ page, context }) => {
    await loginAs(page, 'admin')

    const cliRes = await page.request.post(`${BASE}/api/clientes`, {
      data: { nombre: `C1.2 Cliente ${Date.now()}`, telefono: `3${String(Date.now()).slice(-9)}`, direccion: 'X', barrio: 'Y' },
    })
    const cliData = await cliRes.json()
    const clienteId = cliData.cliente?.id || cliData.data?.id
    if (!clienteId) { test.skip(); return }

    const pedAntes = dbCount('Pedido')

    // Offline
    await context.setOffline(true)

    // fetchResilient llamado desde el contexto offline
    const result = await page.evaluate(async (cid) => {
      // Usar la función fetchResilient directamente (si está expuesta)
      // Si no, simular con fetch y esperar que fetchResilient encole
      const offlineId = crypto.randomUUID()
      try {
        const res = await fetch('/api/pedidos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clienteId: cid,
            canal: 'PUNTO',
            ventaRapida: true,
            items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
            pagos: [{ metodo: 'EFECTIVO', monto: 3000 }],
            offlineId,
          }),
        })
        return { status: res.status, offlineId }
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'unknown', offlineId }
      }
    }, clienteId)

    // Online de nuevo
    await context.setOffline(false)
    await page.waitForTimeout(2000)

    // Esperar sync (el sync worker hace un ping al server)
    await page.evaluate(async () => {
      // Trigger sync manualmente si la función existe
      try {
        const w = window as any
        if (w.__syncOfflineQueue) await w.__syncOfflineQueue()
        if (w.syncOfflineQueue) await w.syncOfflineQueue()
      } catch {}
    })

    await page.waitForTimeout(3000)

    const pedDespues = dbCount('Pedido')
    addFinding({
      severity: pedDespues > pedAntes ? 'P3' : 'P2',
      module: 'offline',
      title: `C1.2: Pedidos antes=${pedAntes}, después=${pedDespues}, delta=${pedDespues - pedAntes}`,
      description: pedDespues > pedAntes
        ? '✅ El pedido offline se sincronizó y apareció en DB.'
        : '❌ El pedido offline NO se sincronizó.',
    })
  })
})
