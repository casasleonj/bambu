import { offlineDb } from './offline'

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

        const res = await fetch('/api/pedidos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clienteId: pedido.clienteId,
            productos: {
              agua19L: pedido.cAguaPed,
              hielo: pedido.cHieloPed,
              botellon: pedido.cBotellonPed,
              bolsaAgua: pedido.cBolsaAguaPed,
              bolsaHielo: pedido.cBolsaHieloPed,
            },
            pagos: pedido.pagos,
            obs: '',
          }),
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
      console.error('Sync failed for item', { id: (item as any).id }, e instanceof Error ? e.message : 'Unknown')
      failed++
    }
  }

  return { synced, failed, conflicts }
}

export function isOnline(): boolean {
  return navigator.onLine
}
