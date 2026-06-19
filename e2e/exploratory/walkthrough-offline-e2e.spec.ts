// @ts-check
// Fase 8: Offline E2E con cola pre-poblada
// Test alternativo: poblar la cola Dexie directamente y verificar el sync

import { test, loginAs, shoot, addFinding, dbCount, BASE } from './walkthrough-helpers'

test.describe('Fase 8. Offline E2E', () => {
  test('C8.1: Sincronización de cola offline pre-poblada', async ({ page }) => {
    await loginAs(page, 'asistente')

    // Crear cliente (online)
    const cliRes = await page.request.post(`${BASE}/api/clientes`, {
      data: { nombre: `C8 Cola ${Date.now()}`, telefono: `3${String(Date.now()).slice(-9)}`, direccion: 'X', barrio: 'Y' },
    })
    const cliData = await cliRes.json()
    const clienteId = cliData.cliente?.id || cliData.data?.id
    if (!clienteId) { test.skip(); return }

    const pedAntes = dbCount('Pedido')

    // Ir a dashboard para inicializar el cliente
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Poblar la cola Dexie directamente con un item offline
    const offlineId = `c8-test-${Date.now()}`
    const putResult = await page.evaluate(async ({ cid, oid }) => {
      const dbs = await indexedDB.databases()
      const bambu = dbs.find((d: any) => d.name?.toLowerCase().includes('bambu') || d.name?.toLowerCase().includes('offline'))
      if (!bambu) return { error: 'No BambuOffline DB found' }

      return new Promise<any>((resolve) => {
        const req = indexedDB.open(bambu.name)
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('requestQueue')) {
            resolve({ error: 'No requestQueue store' })
            return
          }
          const tx = db.transaction('requestQueue', 'readwrite')
          const store = tx.objectStore('requestQueue')
          const item = {
            url: '/api/pedidos',
            method: 'POST',
            body: JSON.stringify({
              clienteId: cid,
              canal: 'PUNTO',
              ventaRapida: true,
              items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
              pagos: [{ metodo: 'EFECTIVO', monto: 3000 }],
              offlineId: oid,
            }),
            offlineId: oid,
            localEndpoint: 'crear-pedido',
            createdAt: new Date(),
          }
          const addReq = store.add(item)
          addReq.onsuccess = () => resolve({ added: true, id: addReq.result })
          addReq.onerror = () => resolve({ error: 'add failed' })
        }
        req.onerror = () => resolve({ error: 'open failed' })
      })
    }, { cid: clienteId, oid: offlineId })

    addFinding({
      severity: 'P3',
      module: 'offline',
      title: `C8.1: Item pushed to Dexie: ${JSON.stringify(putResult).slice(0, 200)}`,
      description: '',
    })

    // Contar cola
    const queueSize = await page.evaluate(async () => {
      const dbs = await indexedDB.databases()
      const bambu = dbs.find((d: any) => d.name?.toLowerCase().includes('bambu') || d.name?.toLowerCase().includes('offline'))
      if (!bambu) return -1
      return new Promise<number>((resolve) => {
        const req = indexedDB.open(bambu.name)
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('requestQueue')) { resolve(-1); return }
          const tx = db.transaction('requestQueue', 'readonly')
          const countReq = tx.objectStore('requestQueue').count()
          countReq.onsuccess = () => resolve(countReq.result)
        }
        req.onerror = () => resolve(-1)
      })
    })

    addFinding({
      severity: queueSize > 0 ? 'P3' : 'P2',
      module: 'offline',
      title: `C8.1: Queue size after push: ${queueSize}`,
      description: queueSize > 0 ? '✅ Item encolado en Dexie' : '❌ Item NO encolado',
    })

    // Disparar sync: dispatch evento online
    await page.evaluate(() => {
      window.dispatchEvent(new Event('online'))
    })

    // Esperar 10s para que el sync worker drene
    await page.waitForTimeout(10000)

    const pedDespues = dbCount('Pedido')
    const queueDespues = await page.evaluate(async () => {
      const dbs = await indexedDB.databases()
      const bambu = dbs.find((d: any) => d.name?.toLowerCase().includes('bambu') || d.name?.toLowerCase().includes('offline'))
      if (!bambu) return -1
      return new Promise<number>((resolve) => {
        const req = indexedDB.open(bambu.name)
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('requestQueue')) { resolve(-1); return }
          const tx = db.transaction('requestQueue', 'readonly')
          const countReq = tx.objectStore('requestQueue').count()
          countReq.onsuccess = () => resolve(countReq.result)
        }
        req.onerror = () => resolve(-1)
      })
    })

    addFinding({
      severity: pedDespues > pedAntes ? 'P3' : 'P2',
      module: 'offline',
      title: `C8.1: Pedidos antes=${pedAntes}, después=${pedDespues}, delta=${pedDespues - pedAntes}; Queue: ${queueSize} → ${queueDespues}`,
      description: pedDespues > pedAntes
        ? '✅ Sincronización funcionó: el item offline se convirtió en pedido real.'
        : `❌ Sincronización NO funcionó. Queue: ${queueSize} → ${queueDespues}. Puede ser que el sync worker no esté montado en este cliente, o el evento online no disparó.`,
    })
  })

  test('C8.2: Connectivity indicator refleja online/offline', async ({ page, context }) => {
    await loginAs(page, 'asistente')

    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    const online = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="connectivity-indicator"]')
      return el?.textContent || 'no indicator'
    })

    await context.setOffline(true)
    await page.waitForTimeout(2000)
    const offline = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="connectivity-indicator"]')
      return el?.textContent || 'no indicator'
    })

    await context.setOffline(false)
    await page.waitForTimeout(2000)
    const onlineAgain = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="connectivity-indicator"]')
      return el?.textContent || 'no indicator'
    })

    addFinding({
      severity: online === 'Online' && offline === 'Offline' && onlineAgain === 'Online' ? 'P3' : 'P1',
      module: 'offline',
      title: 'C8.2: Connectivity indicator funciona',
      description: `Online: "${online}" → Offline: "${offline}" → Online: "${onlineAgain}"`,
    })
  })
})
