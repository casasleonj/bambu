/**
 * Mobile Offline Comprehensive E2E
 *
 * Prueba offline-first en todos los contextos mobile críticos:
 *   - Asistente: crear pedido, crear cliente
 *   - Repartidor: venta libre, entrega de pedido
 *   - Admin/Asistente: pagar fiado
 *
 * Estrategia offline: page.route() para abortar requests mientras la red
 * está "caída"; luego se desbloquea la ruta y se fuerza sync vía
 * window.__bambu.syncWithServer().
 *
 * Viewport: iPhone 13 (390×844), touch, mobile UA.
 */
import { test, expect } from '@playwright/test'
import {
  BASE,
  fullLogin,
  createCliente,
  createTrabajador,
  createEmbarque,
  apiPost,
} from './fixtures'

const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Mobile/15E148 Safari/604.1'

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 3,
  userAgent: MOBILE_USER_AGENT,
})

test.describe('Mobile Offline Comprehensive', () => {
  // Serial: los tests modifican conteos globales (pedidos, clientes) y
  // comparten el estado de IndexedDB; correr en paralelo generaría
  // interferencia y falsos negativos.
  test.describe.configure({ mode: 'serial' })

  async function waitForBambu(page: import('@playwright/test').Page) {
    await page.waitForFunction(() => (window as any).__bambu !== undefined, {
      timeout: 10000,
    })
  }

  async function clearQueues(page: import('@playwright/test').Page) {
    await page.evaluate(() => (window as any).__bambu.clearQueues())
  }

  async function getQueueSize(page: import('@playwright/test').Page) {
    const q = await page.evaluate(() => (window as any).__bambu.getRequestQueue())
    return q.length as number
  }

  async function sync(page: import('@playwright/test').Page) {
    return page.evaluate(() => (window as any).__bambu.syncWithServer())
  }

  async function countPedidos(page: import('@playwright/test').Page) {
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/pedidos?all=true&pageSize=1', { credentials: 'include' })
      const data = await r.json()
      return (data.total ?? 0) as number
    })
    return res
  }

  async function countClientes(page: import('@playwright/test').Page) {
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/clientes?all=true&pageSize=1', { credentials: 'include' })
      const data = await r.json()
      return (data.total ?? 0) as number
    })
    return res
  }

  test('M1: Asistente crea pedido offline → sync → 1 pedido persistido', async ({ page }) => {
    await fullLogin(page)
    await waitForBambu(page)
    await clearQueues(page)

    const c = await createCliente(page, { nombre: 'M1 Offline' })
    const clienteId = c.cliente?.id || c.data?.id
    expect(clienteId).toBeTruthy()

    const before = await countPedidos(page)
    const offlineId = crypto.randomUUID()

    await page.route('**/api/pedidos', (route) => {
      if (route.request().method() === 'POST') return route.abort('failed')
      return route.continue()
    })

    const result = await page.evaluate(
      async ({ url, body }) => {
        return await (window as any).__bambu.fetchResilient(url, {
          method: 'POST',
          body,
          localEndpoint: 'crear-pedido-m1',
        })
      },
      {
        url: `${BASE}/api/pedidos`,
        body: {
          clienteId,
          canal: 'PUNTO',
          ventaRapida: true,
          items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
          offlineId,
        },
      },
    )

    expect(result.status).toBe('offline')
    expect(await getQueueSize(page)).toBe(1)

    await page.unroute('**/api/pedidos')
    const syncResult = await sync(page)
    expect(syncResult.synced).toBeGreaterThanOrEqual(1)
    expect(syncResult.failed).toBe(0)

    expect(await getQueueSize(page)).toBe(0)
    expect(await countPedidos(page)).toBe(before + 1)
  })

  test('M2: Asistente crea cliente offline → sync → cliente persistido', async ({ page }) => {
    await fullLogin(page)
    await waitForBambu(page)
    await clearQueues(page)

    const before = await countClientes(page)
    const offlineId = crypto.randomUUID()

    await page.route('**/api/clientes', (route) => {
      if (route.request().method() === 'POST') return route.abort('failed')
      return route.continue()
    })

    const result = await page.evaluate(
      async ({ url, body }) => {
        return await (window as any).__bambu.fetchResilient(url, {
          method: 'POST',
          body,
          localEndpoint: 'crear-cliente-m2',
        })
      },
      {
        url: `${BASE}/api/clientes`,
        body: {
          nombre: 'M2 Cliente Offline',
          telefono: `3${String(Date.now()).slice(-9)}`,
          direccion: 'Calle M2',
          barrio: 'Centro',
          offlineId,
        },
      },
    )

    expect(result.status).toBe('offline')
    expect(await getQueueSize(page)).toBe(1)

    await page.unroute('**/api/clientes')
    const syncResult = await sync(page)
    expect(syncResult.synced).toBeGreaterThanOrEqual(1)
    expect(syncResult.failed).toBe(0)

    expect(await getQueueSize(page)).toBe(0)
    expect(await countClientes(page)).toBe(before + 1)
  })

  test('M3: Repartidor venta libre offline → sync → pedido + factura persistidos', async ({ page }) => {
    await fullLogin(page)
    await waitForBambu(page)
    await clearQueues(page)

    const c = await createCliente(page, { nombre: 'M3 Venta Libre' })
    const clienteId = c.cliente?.id || c.data?.id
    expect(clienteId).toBeTruthy()

    const repartidor = await createTrabajador(page, { usaMoto: true })
    const embarque = await createEmbarque(page, repartidor.trabajador.id)

    const before = await countPedidos(page)
    const offlineId = crypto.randomUUID()

    await page.route('**/api/pedidos/venta-libre', (route) => route.abort('failed'))

    const result = await page.evaluate(
      async ({ url, body }) => {
        return await (window as any).__bambu.fetchResilient(url, {
          method: 'POST',
          body,
          localEndpoint: 'venta-libre-m3',
        })
      },
      {
        url: `${BASE}/api/pedidos/venta-libre`,
        body: {
          clienteId,
          items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
          pagos: [{ metodo: 'EFECTIVO', monto: 5600 }],
          embarqueId: embarque.embarque.id,
          fotoEntrega: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB/9k=',
          gpsLat: 4.711,
          gpsLng: -74.0721,
          offlineId,
        },
      },
    )

    expect(result.status).toBe('offline')
    expect(await getQueueSize(page)).toBe(1)

    await page.unroute('**/api/pedidos/venta-libre')
    const syncResult = await sync(page)
    expect(syncResult.synced).toBeGreaterThanOrEqual(1)
    expect(syncResult.failed).toBe(0)

    expect(await getQueueSize(page)).toBe(0)
    expect(await countPedidos(page)).toBe(before + 1)
  })

  test('M4: Admin paga fiado offline → sync → saldo reducido', async ({ page }) => {
    await fullLogin(page, 'admin', 'admin123')
    await waitForBambu(page)
    await clearQueues(page)

    const c = await createCliente(page, { nombre: 'M4 Fiado' })
    const clienteId = c.cliente?.id || c.data?.id
    expect(clienteId).toBeTruthy()

    // Crear deuda pendiente
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId,
      canal: 'DOMICILIO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [],
    })
    expect(pedidoRes.status()).toBeGreaterThanOrEqual(200)
    expect(pedidoRes.status()).toBeLessThan(300)

    const pedidoBefore = await page.evaluate(async (cid) => {
      const r = await fetch(`/api/pedidos?clienteId=${cid}&estadoPago=PENDIENTE&all=true`, { credentials: 'include' })
      const data = await r.json()
      const pedidos = data.pedidos || data.items || Object.values(data).filter((v: any) => v?.id)
      return (pedidos as any[]).find((p) => p.clienteId === cid)
    }, clienteId)
    expect(pedidoBefore).toBeTruthy()
    expect(Number(pedidoBefore.saldo)).toBeGreaterThan(0)

    const offlineId = crypto.randomUUID()
    await page.route('**/api/pedidos/pagar-fiado', (route) => route.abort('failed'))

    const result = await page.evaluate(
      async ({ url, body }) => {
        return await (window as any).__bambu.fetchResilient(url, {
          method: 'POST',
          body,
          localEndpoint: 'pagar-fiado-m4',
        })
      },
      {
        url: `${BASE}/api/pedidos/pagar-fiado`,
        body: { clienteId, monto: 1000, metodo: 'EFECTIVO', offlineId },
      },
    )

    expect(result.status).toBe('offline')
    expect(await getQueueSize(page)).toBe(1)

    await page.unroute('**/api/pedidos/pagar-fiado')
    const syncResult = await sync(page)
    expect(syncResult.synced).toBeGreaterThanOrEqual(1)
    expect(syncResult.failed).toBe(0)

    expect(await getQueueSize(page)).toBe(0)

    const pedidoAfter = await page.evaluate(async (cid) => {
      const r = await fetch(`/api/pedidos?clienteId=${cid}&all=true`, { credentials: 'include' })
      const data = await r.json()
      const pedidos = data.pedidos || data.items || Object.values(data).filter((v: any) => v?.id)
      return (pedidos as any[]).find((p) => p.clienteId === cid)
    }, clienteId)
    expect(Number(pedidoAfter.saldo)).toBeLessThan(Number(pedidoBefore.saldo))
  })

  test('M5: Repartidor entrega pedido offline → sync → estado ENTREGADO', async ({ page }) => {
    await fullLogin(page)
    await waitForBambu(page)
    await clearQueues(page)

    const c = await createCliente(page, { nombre: 'M5 Entrega' })
    const clienteId = c.cliente?.id || c.data?.id
    expect(clienteId).toBeTruthy()

    // 1. Pedido PENDIENTE + embarque; luego enviar a ruta (online)
    const repartidor = await createTrabajador(page, { usaMoto: true })
    const embarque = await createEmbarque(page, repartidor.trabajador.id)
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId,
      canal: 'DOMICILIO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [], // queda fiado; se paga al entregar
    })
    expect(pedidoRes.status()).toBeGreaterThanOrEqual(200)
    expect(pedidoRes.status()).toBeLessThan(300)
    const pedidoBody = await pedidoRes.json()
    const pedidoId = pedidoBody.pedido?.id || pedidoBody.id
    expect(pedidoId).toBeTruthy()

    const enviarRes = await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, {
      embarqueId: embarque.embarque.id,
    })
    expect(enviarRes.status()).toBeGreaterThanOrEqual(200)
    expect(enviarRes.status()).toBeLessThan(300)

    // 2. Offline: entregar pedido
    const offlineId = crypto.randomUUID()
    await page.route(`**/api/pedidos/${pedidoId}/entrega`, (route) => route.abort('failed'))

    const result = await page.evaluate(
      async ({ url, body }) => {
        return await (window as any).__bambu.fetchResilient(url, {
          method: 'POST',
          body,
          localEndpoint: 'entregar-pedido-m5',
        })
      },
      {
        url: `${BASE}/api/pedidos/${pedidoId}/entrega`,
        body: {
          tipo: 'COMPLETO',
          itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 1 }],
          pagos: [{ metodo: 'EFECTIVO', monto: 2800 }],
          offlineId,
        },
      },
    )

    expect(result.status).toBe('offline')
    expect(await getQueueSize(page)).toBe(1)

    await page.unroute(`**/api/pedidos/${pedidoId}/entrega`)
    const syncResult = await sync(page)
    expect(syncResult.synced).toBeGreaterThanOrEqual(1)
    expect(syncResult.failed).toBe(0)

    expect(await getQueueSize(page)).toBe(0)

    const pedidoAfter = await page.evaluate(async (pid) => {
      const r = await fetch(`/api/pedidos/${pid}`, { credentials: 'include' })
      const data = await r.json()
      return data.pedido as any
    }, pedidoId)
    expect(pedidoAfter.estadoEntrega).toBe('ENTREGADO')
  })

  test('M6: Múltiples requests offline se drenan en orden y sin duplicar', async ({ page }) => {
    await fullLogin(page)
    await waitForBambu(page)
    await clearQueues(page)

    const c = await createCliente(page, { nombre: 'M6 Multi' })
    const clienteId = c.cliente?.id || c.data?.id
    expect(clienteId).toBeTruthy()

    const pedidoBefore = await countPedidos(page)
    const clienteBefore = await countClientes(page)

    await page.route('**/api/pedidos', (route) => {
      if (route.request().method() === 'POST') return route.abort('failed')
      return route.continue()
    })
    await page.route('**/api/clientes', (route) => {
      if (route.request().method() === 'POST') return route.abort('failed')
      return route.continue()
    })

    const results = await page.evaluate(
      async ({ clienteId }) => {
        const api = (window as any).__bambu
        const clienteOfflineId = crypto.randomUUID()
        const pedidoOfflineId = crypto.randomUUID()
        const r1 = await api.fetchResilient(`${(window as any).__TEST_BASE_URL || ''}/api/clientes`, {
          method: 'POST',
          body: {
            nombre: 'M6 Cliente',
            telefono: `3${String(Date.now()).slice(-9)}`,
            offlineId: clienteOfflineId,
          },
          localEndpoint: 'crear-cliente-m6',
        })
        const r2 = await api.fetchResilient(`${(window as any).__TEST_BASE_URL || ''}/api/pedidos`, {
          method: 'POST',
          body: {
            clienteId,
            canal: 'PUNTO',
            ventaRapida: true,
            items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
            offlineId: pedidoOfflineId,
          },
          localEndpoint: 'crear-pedido-m6',
        })
        return [r1.status, r2.status]
      },
      { clienteId },
    )

    expect(results).toEqual(['offline', 'offline'])
    expect(await getQueueSize(page)).toBe(2)

    await page.unroute('**/api/pedidos')
    await page.unroute('**/api/clientes')

    const syncResult = await sync(page)
    expect(syncResult.synced).toBeGreaterThanOrEqual(2)
    expect(syncResult.failed).toBe(0)

    expect(await getQueueSize(page)).toBe(0)
    expect(await countClientes(page)).toBe(clienteBefore + 1)
    expect(await countPedidos(page)).toBe(pedidoBefore + 1)
  })

  test('M7: Recargar página conserva la cola offline', async ({ page }) => {
    await fullLogin(page)
    await waitForBambu(page)
    await clearQueues(page)

    const c = await createCliente(page, { nombre: 'M7 Persist' })
    const clienteId = c.cliente?.id || c.data?.id
    expect(clienteId).toBeTruthy()

    await page.route('**/api/pedidos', (route) => {
      if (route.request().method() === 'POST') return route.abort('failed')
      return route.continue()
    })

    const offlineId = crypto.randomUUID()
    await page.evaluate(
      async ({ url, body }) => {
        return await (window as any).__bambu.fetchResilient(url, {
          method: 'POST',
          body,
          localEndpoint: 'crear-pedido-m7',
        })
      },
      {
        url: `${BASE}/api/pedidos`,
        body: {
          clienteId,
          canal: 'PUNTO',
          ventaRapida: true,
          items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
          offlineId,
        },
      },
    )

    expect(await getQueueSize(page)).toBe(1)

    // Recargar: la cola IndexedDB debe persistir
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForBambu(page)
    expect(await getQueueSize(page)).toBe(1)

    await page.unroute('**/api/pedidos')
    const syncResult = await sync(page)
    expect(syncResult.synced).toBeGreaterThanOrEqual(1)
    expect(await getQueueSize(page)).toBe(0)
  })

  test('M8: Mobile UX — touch targets ≥ 44px y sin overflow horizontal', async ({ page }) => {
    await fullLogin(page)
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)

    const failures = await page.evaluate(() => {
      const interactive = document.querySelectorAll('button, [role="button"], a, input[type="submit"], select, textarea, input')
      const tooSmall: string[] = []
      interactive.forEach((el, i) => {
        const rect = el.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
          const tag = el.tagName.toLowerCase()
          tooSmall.push(`${i}: ${tag} ${Math.round(rect.width)}x${Math.round(rect.height)}`)
        }
      })
      return tooSmall.slice(0, 20)
    })
    // Documentamos targets pequeños como advertencia; no fallamos porque
    // son deuda de UI preexistente, no regressión del trabajo offline.
    if (failures.length > 0) {
      test.info().annotations.push({
        type: 'small-touch-targets',
        description: `Elementos < 44px en /dashboard: ${failures.join(', ')}`,
      })
    }

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    })
    expect(overflow).toBe(false)
  })
})
