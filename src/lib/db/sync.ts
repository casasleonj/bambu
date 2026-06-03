import { offlineDb } from './offline'
import { logger } from '@/lib/logger'

const BATCH_SIZE = 25 // Drain N items per batch to avoid long blocking sync

export interface SyncResult {
  synced: number
  failed: number
  conflicts: number
  remaining: number
  drained: boolean // true si la cola quedó vacía
}

export async function syncWithServer(): Promise<SyncResult> {
  const queue = await offlineDb.syncQueue.orderBy('createdAt').limit(BATCH_SIZE).toArray()
  const requestQueue = await offlineDb.requestQueue.orderBy('createdAt').limit(BATCH_SIZE).toArray()
  let synced = 0
  let failed = 0
  let conflicts = 0

  // 1) Replay de requests crudas encoladas por fetchResilient()
  for (const req of requestQueue) {
    try {
      const res = await fetch(req.url, {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: req.body,
      })
      if (res.ok) {
        await offlineDb.requestQueue.delete(req.id!)
        synced++
        logger.info(
          { localId: req.offlineId, endpoint: req.localEndpoint },
          'Sync: request reencolada completada'
        )
      } else if (res.status === 409) {
        // Conflicto (ej: dedup por offlineId encuentra existente) = OK
        await offlineDb.requestQueue.delete(req.id!)
        conflicts++
        logger.warn(
          { localId: req.offlineId, endpoint: req.localEndpoint, status: 409 },
          'Sync: conflict resuelto por server (dedup)'
        )
      } else {
        failed++
        logger.warn(
          { localId: req.offlineId, endpoint: req.localEndpoint, status: res.status },
          'Sync: server respondió con error, se mantiene en cola'
        )
      }
    } catch (e) {
      logger.error(
        { err: e instanceof Error ? e.message : 'Unknown', id: req.id },
        'Sync: request reencolada falló de red, se mantiene'
      )
      failed++
    }
  }

  for (const item of queue) {
    try {
      if (item.table === 'pedidos' && item.operation === 'create') {
        const pedido = await offlineDb.pedidos.where('localId').equals(item.localId).first()
        if (!pedido) continue

        const isVentaLibre = pedido.origen === 'VENTA_LIBRE'
        const endpoint = isVentaLibre ? '/api/pedidos/venta-libre' : '/api/pedidos'

        const body = isVentaLibre
          ? {
              clienteId: pedido.clienteId,
              negocioId: pedido.negocioId,
              items: pedido.items,
              pagos: pedido.pagos,
              embarqueId: pedido.embarqueId,
              obs: pedido.obs,
              fotoEntrega: pedido.fotoEntrega,
              gpsLat: pedido.gpsLat,
              gpsLng: pedido.gpsLng,
              offlineId: pedido.localId,
            }
          : {
              clienteId: pedido.clienteId,
              negocioId: pedido.negocioId,
              items: pedido.items,
              pagos: pedido.pagos,
              canal: pedido.canal || 'DOMICILIO',
              origen: pedido.origen || 'PEDIDO',
              obs: pedido.obs,
              fechaEntrega: pedido.fechaEntrega,
            }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (res.ok) {
          const serverPedido = await res.json()
          await offlineDb.pedidos.where('localId').equals(item.localId).modify({
            numero: serverPedido.pedido?.numero,
            syncStatus: 'synced',
          })
          await offlineDb.syncQueue.delete(item.id!)
          synced++
        } else if (res.status === 409) {
          await offlineDb.pedidos.where('localId').equals(item.localId).modify({
            syncStatus: 'conflict',
          })
          await offlineDb.syncQueue.delete(item.id!)
          conflicts++
        } else {
          failed++
        }
      } else if (item.table === 'clientes' && item.operation === 'create') {
        const cliente = await offlineDb.clientes.where('localId').equals(item.localId).first()
        if (!cliente) continue

        const res = await fetch('/api/clientes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: cliente.nombre,
            telefono: cliente.telefono,
            direccion: cliente.direccion,
            barrio: cliente.barrio,
            rutaId: cliente.rutaId,
          }),
        })

        if (res.ok) {
          await offlineDb.clientes.where('localId').equals(item.localId).modify({
            syncStatus: 'synced',
          })
          await offlineDb.syncQueue.delete(item.id!)
          synced++
        } else if (res.status === 409) {
          await offlineDb.clientes.where('localId').equals(item.localId).modify({
            syncStatus: 'conflict',
          })
          await offlineDb.syncQueue.delete(item.id!)
          conflicts++
        } else {
          failed++
        }
      }
    } catch (e) {
      logger.error({ err: e instanceof Error ? e.message : 'Unknown', id: (item as any).id }, 'Sync failed for item')
      failed++
    }
  }

  // Reportar si quedan items pendientes
  const remainingRequest = await offlineDb.requestQueue.count()
  const remainingSync = await offlineDb.syncQueue.count()
  const remaining = remainingRequest + remainingSync
  return { synced, failed, conflicts, remaining, drained: remaining === 0 }
}

export function isOnline(): boolean {
  return navigator.onLine
}
