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

// Conflict resolution strategies
export type ConflictStrategy = 'local-wins' | 'server-wins' | 'merge'

export interface ConflictResolution {
  localId: string
  table: 'pedidos' | 'clientes'
  strategy: ConflictStrategy
  resolvedData?: Record<string, unknown>
}

/**
 * Resolve a conflict between local and server data.
 * Default strategy: local-wins for data created offline, server-wins for updates to existing data.
 */
export async function resolveConflict(resolution: ConflictResolution): Promise<void> {
  const { localId, table, strategy, resolvedData } = resolution
  const dbTable = table === 'pedidos' ? offlineDb.pedidos : offlineDb.clientes

  const localItem = await dbTable.where('localId').equals(localId).first()
  if (!localItem) return

  if (strategy === 'local-wins') {
    await dbTable.update(localItem.id!, { syncStatus: 'pending', updatedAt: new Date() })
    // Re-queue for sync
    await offlineDb.syncQueue.add({
      operation: 'create',
      table,
      localId,
      createdAt: new Date(),
    })
  } else if (strategy === 'server-wins') {
    await dbTable.update(localItem.id!, { syncStatus: 'synced', updatedAt: new Date() })
  } else if (strategy === 'merge' && resolvedData) {
    await dbTable.update(localItem.id!, {
      ...resolvedData,
      syncStatus: 'pending',
      updatedAt: new Date(),
    })
    await offlineDb.syncQueue.add({
      operation: 'create',
      table,
      localId,
      createdAt: new Date(),
    })
  }
}

/**
 * Get all items with conflicts for manual resolution.
 */
export async function getConflicts() {
  const [pedidos, clientes] = await Promise.all([
    offlineDb.pedidos.where('syncStatus').equals('conflict').toArray(),
    offlineDb.clientes.where('syncStatus').equals('conflict').toArray(),
  ])
  return { pedidos, clientes }
}

/**
 * Process the sync queue and attempt to sync pending items.
 * Should be called when connectivity is restored.
 */
export async function processSyncQueue(
  syncFn: (item: SyncQueueItem, localData: OfflinePedido | OfflineCliente) => Promise<{ success: boolean; conflict?: boolean; serverData?: Record<string, unknown> }>
): Promise<{ processed: number; conflicts: number; errors: number }> {
  const queue = await offlineDb.syncQueue.orderBy('createdAt').toArray()
  let processed = 0
  let conflicts = 0
  let errors = 0

  for (const item of queue) {
    try {
      const localData = await (item.table === 'pedidos'
        ? offlineDb.pedidos.where('localId').equals(item.localId).first()
        : offlineDb.clientes.where('localId').equals(item.localId).first())

      if (!localData) continue

      const result = await syncFn(item, localData)

      if (result.conflict) {
        const dbTable = item.table === 'pedidos' ? offlineDb.pedidos : offlineDb.clientes
        await dbTable.update((localData as any).id!, { syncStatus: 'conflict' })
        conflicts++
      } else if (result.success) {
        const dbTable = item.table === 'pedidos' ? offlineDb.pedidos : offlineDb.clientes
        await dbTable.update((localData as any).id!, { syncStatus: 'synced' })
        await offlineDb.syncQueue.delete(item.id!)
        processed++
      } else {
        errors++
      }
    } catch (e) {
      console.error('[SYNC] Error processing queue item:', e)
      errors++
    }
  }

  return { processed, conflicts, errors }
}
