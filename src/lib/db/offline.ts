import Dexie, { type Table } from 'dexie'

export interface OfflinePedido {
  id?: number
  localId: string
  data: any
  synced: boolean
  createdAt: Date
}

export interface OfflineCliente {
  id?: number
  localId: string
  data: any
  synced: boolean
  createdAt: Date
}

class BambuOfflineDB extends Dexie {
  pedidos!: Table<OfflinePedido, number>
  clientes!: Table<OfflineCliente, number>

  constructor() {
    super('BambuOfflineDB')
    this.version(1).stores({
      pedidos: '++id, localId, synced, createdAt',
      clientes: '++id, localId, synced, createdAt',
    })
  }
}

export const offlineDb = new BambuOfflineDB()

export async function queuePedido(data: any) {
  return offlineDb.pedidos.add({
    localId: crypto.randomUUID(),
    data,
    synced: false,
    createdAt: new Date(),
  })
}

export async function syncPedidos() {
  const unsynced = await offlineDb.pedidos.where('synced').equals(0).toArray()
  
  for (const pedido of unsynced) {
    try {
      await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pedido.data),
      })
      await offlineDb.pedidos.update(pedido.id!, { synced: true })
    } catch (error) {
      console.error('Error syncing pedido:', error)
    }
  }
}