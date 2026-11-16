import { test, expect, type Page, type Request } from '@playwright/test'
import type { FailedItem, OfflinePedido, OfflineRequest } from '../../../src/lib/db/offline'
import { setupEmbarque, clearOfflineDb, abrirRepartidor, guardarVentaLibreOffline } from './helpers'

function leerColas(page: Page) {
  return page.evaluate(() => new Promise<{
    pendientes: OfflineRequest[]
    fallidos: FailedItem[]
    pedidos: OfflinePedido[]
  }>((resolve, reject) => {
    const apertura = indexedDB.open('BambuOfflineDB')
    apertura.onupgradeneeded = () => apertura.transaction?.abort()
    apertura.onerror = () => reject(apertura.error)
    apertura.onsuccess = () => {
      const db = apertura.result
      if (!['requestQueue', 'failedItems', 'pedidos'].every(name => db.objectStoreNames.contains(name))) {
        db.close()
        reject(new Error('Faltan las tablas offline de la aplicación'))
        return
      }
      const tx = db.transaction(['requestQueue', 'failedItems', 'pedidos'], 'readonly')
      const pendientes = tx.objectStore('requestQueue').getAll()
      const fallidos = tx.objectStore('failedItems').getAll()
      const pedidos = tx.objectStore('pedidos').getAll()
      tx.onabort = () => { db.close(); reject(tx.error) }
      tx.oncomplete = () => {
        db.close()
        resolve({
          pendientes: pendientes.result as OfflineRequest[],
          fallidos: fallidos.result as FailedItem[],
          pedidos: pedidos.result as OfflinePedido[],
        })
      }
    }
  }))
}

function esEnvio(request: Request, offlineId: string) {
  if (request.method() !== 'POST' || new URL(request.url()).pathname !== '/api/pedidos/venta-libre') return false
  const body: unknown = request.postDataJSON()
  return typeof body === 'object' && body !== null && 'offlineId' in body && body.offlineId === offlineId
}

test.describe('M7 DLQ 4xx', () => {
  // #592 exige 10/10 consecutivas en CI. Mantenerlas en el mismo shard por
  // proyecto y no convertir un fallo inicial en aprobado mediante retries.
  test.describe.configure({ mode: 'serial', retries: 0 })

  test.beforeEach(async ({ page }) => {
    await setupEmbarque(page)
  })

  test.afterEach(async ({ page }) => {
    await clearOfflineDb(page)
  })

  for (let intento = 1; intento <= 10; intento++) {
    const retener = intento % 2 === 0
    const nombre = intento === 1 ? '4xx mueve pedido a DLQ y muestra badge'
      : `4xx mueve pedido a DLQ y muestra badge (${intento}/10, respuesta ${retener ? 'retenida' : 'inmediata'})`
    test(nombre, async ({ page }) => {
      await abrirRepartidor(page)
      await guardarVentaLibreOffline(page)
      const inicial = await leerColas(page)
      expect(inicial.pendientes).toHaveLength(1)
      expect(inicial.fallidos).toHaveLength(0)
      const pendiente = inicial.pendientes[0]
      const { offlineId } = pendiente
      expect(inicial.pedidos).toEqual([expect.objectContaining({ localId: offlineId, syncStatus: 'pending' })])

      let recibida = () => {}
      const solicitudRecibida = new Promise<void>(resolve => { recibida = resolve })
      let responder = () => {}
      const permisoRespuesta = new Promise<void>(resolve => { responder = resolve })
      if (!retener) responder()
      let envios = 0
      await page.route('/api/pedidos/venta-libre', async route => {
        if (!esEnvio(route.request(), offlineId)) { await route.continue(); return }
        envios++
        recibida()
        await permisoRespuesta
        await route.fulfill({ status: 400, json: { error: 'bad request' } })
      })

      try {
        const [respuesta] = await Promise.all([
          page.waitForResponse(response => esEnvio(response.request(), offlineId)),
          (async () => {
            await page.context().setOffline(false)
            const sincronizar = page.getByTestId('btn-sync-repartidor').first()
            await expect(sincronizar).toBeEnabled()
            await sincronizar.click()
            if (retener) {
              await solicitudRecibida
              const durante = await leerColas(page)
              expect(durante.pendientes.map(item => item.offlineId)).toEqual([offlineId])
              expect(durante.fallidos).toHaveLength(0)
            }
            responder()
          })(),
        ])
        expect(respuesta.status()).toBe(400)
        expect(await respuesta.finished()).toBeNull()
        // Recibir HTTP 400 no demuestra que Dexie haya terminado sus escrituras.
        await expect.poll(async () => {
          const estado = await leerColas(page)
          return {
            pendientes: estado.pendientes.length,
            fallidos: estado.fallidos.map(item => item.offlineId),
            pedidos: estado.pedidos.map(item => ({ localId: item.localId, syncStatus: item.syncStatus })),
          }
        }).toEqual({ pendientes: 0, fallidos: [offlineId], pedidos: [{ localId: offlineId, syncStatus: 'conflict' }] })
        const persistido = await leerColas(page)
        expect(persistido.fallidos[0]).toMatchObject({
          offlineId, body: pendiente.body, url: pendiente.url, method: pendiente.method,
          localEndpoint: pendiente.localEndpoint, attempts: 1, lastError: 'HTTP 400: error de cliente',
        })

        await page.reload()
        await expect(page.getByTestId('failed-sync-counter')).toBeVisible()
        await expect(page.getByTestId('failed-sync-counter')).toHaveAttribute('title', '1 cambio fallido de sincronizar')
        expect(await leerColas(page)).toEqual(persistido)
        // El botón actual cuenta pendientes + fallidos. Un segundo sync no
        // debe reenviar el rechazo permanente ni duplicar su evidencia.
        await page.getByTestId('btn-sync-repartidor').first().click()
        await expect(page.getByText(/^Sincronizado:/)).toBeVisible()
        expect(await leerColas(page)).toEqual(persistido)
        expect(envios).toBe(1)
      } finally {
        responder()
      }
    })
  }
})
