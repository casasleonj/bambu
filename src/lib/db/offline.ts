import Dexie, { type Table } from 'dexie'

export interface OfflinePedido {
  id?: number
  localId: string
  numero?: number
  clienteId: string
  cAguaPed: number
  cHieloPed: number
  cBotellonPed: number
  cBolsaAguaPed: number
  cBolsaHieloPed: number
  precioAgua?: number
  precioHielo?: number
  precioBotellon?: number
  precioBolsaAgua?: number
  precioBolsaHielo?: number
  total: number
  pagos: { metodo: string; monto: number }[]
  estado: string
  syncStatus: 'pending' | 'synced' | 'conflict'
  createdAt: Date
  updatedAt: Date
}

export interface OfflineCliente {
  id?: number
  localId: string
  nombre: string
  telefono: string
  direccion?: string
  barrio?: string
  rutaId?: string
  syncStatus: 'pending' | 'synced' | 'conflict'
  createdAt: Date
  updatedAt: Date
}

export interface SyncQueueItem {
  id?: number
  operation: 'create' | 'update' | 'delete'
  table: 'pedidos' | 'clientes'
  localId: string
  createdAt: Date
}

class BambuOfflineDB extends Dexie {
  pedidos!: Table<OfflinePedido, number>
  clientes!: Table<OfflineCliente, number>
  syncQueue!: Table<SyncQueueItem, number>

  constructor() {
    super('BambuOfflineDB')
    this.version(2).stores({
      pedidos: '++id, localId, numero, clienteId, syncStatus, createdAt',
      clientes: '++id, localId, nombre, syncStatus, createdAt',
      syncQueue: '++id, table, operation, createdAt',
    })
  }
}

export const offlineDb = new BambuOfflineDB()

export async function queuePedidoOffline(data: Omit<OfflinePedido, 'id' | 'localId' | 'syncStatus' | 'createdAt' | 'updatedAt'>) {
  const localId = crypto.randomUUID()
  const now = new Date()
  await offlineDb.pedidos.add({
    ...data,
    localId,
    syncStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  })
  await offlineDb.syncQueue.add({
    operation: 'create',
    table: 'pedidos',
    localId,
    createdAt: now,
  })
  return localId
}

export async function queueClienteOffline(data: Omit<OfflineCliente, 'id' | 'localId' | 'syncStatus' | 'createdAt' | 'updatedAt'>) {
  const localId = crypto.randomUUID()
  const now = new Date()
  await offlineDb.clientes.add({
    ...data,
    localId,
    syncStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  })
  await offlineDb.syncQueue.add({
    operation: 'create',
    table: 'clientes',
    localId,
    createdAt: now,
  })
  return localId
}
