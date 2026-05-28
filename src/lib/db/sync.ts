import { offlineDb } from './offline'
import { logger } from '@/lib/logger'

export async function syncWithServer(): Promise<{ synced: number; failed: number; conflicts: number }> {
  const queue = await offlineDb.syncQueue.orderBy('createdAt').toArray()
  let synced = 0
  let failed = 0
  let conflicts = 0

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

  return { synced, failed, conflicts }
}

export function isOnline(): boolean {
  return navigator.onLine
}
