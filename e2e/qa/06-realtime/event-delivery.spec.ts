// @tests M6 — realtime event delivery E2E
// Requiere dev server iniciado con REDIS_URL. Si no, los tests se saltan.

import { test, expect, fullLogin, apiCall, loginAs, createTrabajador, createEmbarque } from '../../fixtures-paranoid'

declare global {
  interface Window {
    __rtEvents?: Array<{ type: string; id: string; timestamp: string }>
    __rtEs?: EventSource
    __rtConnected?: boolean
    __rtFailed?: boolean
  }
}

test.describe.configure({ mode: 'serial', retries: 0 })

test.describe('M6: realtime event delivery', () => {
  async function openRealtime(page: import('@playwright/test').Page): Promise<boolean> {
    return page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        window.__rtEvents = []
        const es = new EventSource('/api/realtime')
        window.__rtEs = es
        const timeout = setTimeout(() => {
          es.close()
          resolve(false)
        }, 8000)
        es.addEventListener('connected', () => {
          clearTimeout(timeout)
          resolve(true)
        })
        es.addEventListener('rate_limited', () => {
          clearTimeout(timeout)
          resolve(false)
        })
        es.addEventListener('error', () => {
          clearTimeout(timeout)
          resolve(false)
        })
        es.addEventListener('message', (e) => {
          window.__rtEvents!.push(JSON.parse(e.data))
        })
      })
    })
  }

  async function closeRealtime(page: import('@playwright/test').Page) {
    await page.evaluate(() => {
      window.__rtEs?.close()
    })
  }

  async function waitForEvent(
    page: import('@playwright/test').Page,
    type: string,
    timeout = 5000,
  ) {
    await expect
      .poll(async () => {
        const events = await page.evaluate(() => window.__rtEvents || [])
        return events.some((e) => e.type === type)
      }, { timeout })
      .toBe(true)
  }

  test('RT-E2E-01: crear cliente emite cliente.created', async ({ page }) => {
    await fullLogin(page)
    const connected = await openRealtime(page)
    test.skip(!connected, 'Realtime not available; start server with REDIS_URL')

    const unique = Date.now()
    const res = await apiCall(page, '/api/clientes', {
      method: 'POST',
      body: {
        nombre: `RT Cliente ${unique}`,
        telefono: `300${unique.toString().slice(-8)}`,
        direccion: 'Calle RT',
        tipo: 'DOMICILIO',
      },
    })
    expect(res.status()).toBe(201)

    await waitForEvent(page, 'cliente.created')
    await closeRealtime(page)
  })

  test('RT-E2E-02: cancelar pedido emite pedido.updated', async ({ page }) => {
    await fullLogin(page)

    // Crear un cliente y un pedido para tener uno que cancelar
    const unique = Date.now()
    const clienteRes = await apiCall(page, '/api/clientes', {
      method: 'POST',
      body: {
        nombre: `RT Pedido ${unique}`,
        telefono: `302${unique.toString().slice(-8)}`,
        direccion: 'Calle RT',
        tipo: 'DOMICILIO',
      },
    })
    expect(clienteRes.status()).toBe(201)
    const cliente = await clienteRes.json()
    const clienteId = cliente.cliente?.id || cliente.id
    expect(clienteId).toBeTruthy()

    const pedidoRes = await apiCall(page, '/api/pedidos', {
      method: 'POST',
      body: {
        clienteId,
        items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 0 }],
        offlineId: `rt-pedido-${unique}`,
      },
    })
    expect(pedidoRes.status()).toBe(201)
    const pedido = await pedidoRes.json()
    const pedidoId = pedido.pedido?.id || pedido.id
    expect(pedidoId).toBeTruthy()

    const connected = await openRealtime(page)
    test.skip(!connected, 'Realtime not available; start server with REDIS_URL')

    const cancelRes = await apiCall(page, `/api/pedidos/${pedidoId}/cancelar`, {
      method: 'POST',
      body: { motivo: 'test realtime' },
    })
    expect(cancelRes.status()).toBe(200)

    await waitForEvent(page, 'pedido.updated')
    await closeRealtime(page)
  })

  test('RT-E2E-03: crear embarque emite embarque.created', async ({ page }) => {
    await fullLogin(page)

    const connected = await openRealtime(page)
    test.skip(!connected, 'Realtime not available; start server with REDIS_URL')

    const trabajador = await createTrabajador(page, { usaMoto: true })
    const trabajadorId = trabajador.trabajador?.id || trabajador.id
    if (!trabajadorId) throw new Error('createTrabajador did not return an id')

    const emb = await createEmbarque(page, trabajadorId)
    expect(emb.embarque?.id || emb.id).toBeTruthy()

    await waitForEvent(page, 'embarque.created')
    await closeRealtime(page)
  })

  test('RT-E2E-04: broadcast sin filtro de rol', async ({ page, browser }) => {
    await fullLogin(page)
    const adminConnected = await openRealtime(page)
    test.skip(!adminConnected, 'Realtime not available; start server with REDIS_URL')

    // Repartidor en un contexto separado para no compartir cookie de sesión
    // con el admin (Auth.js usa cookies; mismo contexto = mismo usuario).
    const repContext = await browser.newContext()
    const repPage = await repContext.newPage()
    await loginAs(repPage, 'repartidor')
    const repConnected = await openRealtime(repPage)
    if (!repConnected) {
      await closeRealtime(page)
      await repContext.close()
      test.skip(!repConnected, 'Repartidor realtime not available')
    }

    // Trigger event as admin
    const unique = Date.now()
    const res = await apiCall(page, '/api/clientes', {
      method: 'POST',
      body: {
        nombre: `RT Broadcast ${unique}`,
        telefono: `301${unique.toString().slice(-8)}`,
        direccion: 'Calle RT',
        tipo: 'DOMICILIO',
      },
    })
    expect(res.status()).toBe(201)

    await waitForEvent(page, 'cliente.created')
    await waitForEvent(repPage, 'cliente.created')

    await closeRealtime(page)
    await closeRealtime(repPage)
    await repContext.close()
  })
})
