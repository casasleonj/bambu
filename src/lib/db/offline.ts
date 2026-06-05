import { generateUUID } from '../uuid'
import Dexie, { type Table } from 'dexie'
import { logger } from '@/lib/logger'

export interface OfflinePedidoItem {
  producto: 'PACA_AGUA' | 'PACA_HIELO' | 'BOTELLON' | 'BOLSA_AGUA' | 'BOLSA_HIELO'
  cantidad: number
  precioManual?: number
}

export interface OfflinePedido {
  id?: number
  localId: string
  numero?: number
  clienteId: string
  negocioId?: string
  items: OfflinePedidoItem[]
  origen: 'PEDIDO' | 'VENTA_RAPIDA' | 'VENTA_LIBRE'
  canal?: 'PUNTO' | 'DOMICILIO'
  embarqueId?: string
  pagos: { metodo: 'EFECTIVO' | 'TRANSFERENCIA' | 'NEQUI' | 'DAVIPLATA' | 'BONO'; monto: number }[]
  total: number
  estado: string
  syncStatus: 'pending' | 'synced' | 'conflict'
  fotoEntrega?: string
  gpsLat?: number
  gpsLng?: number
  obs?: string
  fechaEntrega?: string
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

export interface OfflineRequest {
  id?: number
  url: string
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body: string
  offlineId: string
  localEndpoint: string
  createdAt: Date
}

class BambuOfflineDB extends Dexie {
  pedidos!: Table<OfflinePedido, number>
  clientes!: Table<OfflineCliente, number>
  syncQueue!: Table<SyncQueueItem, number>
  requestQueue!: Table<OfflineRequest, number>

  constructor() {
    super('BambuOfflineDB')
    this.version(3).stores({
      pedidos: '++id, localId, numero, clienteId, syncStatus, createdAt, origen, embarqueId',
      clientes: '++id, localId, nombre, syncStatus, createdAt',
      syncQueue: '++id, table, operation, createdAt',
    })
    // v4: añade requestQueue para que fetchResilient() reencole requests crudas
    // (POST/PUT/PATCH/DELETE a /api/pedidos/*, /api/precios/resolver, etc.)
    this.version(4).stores({
      pedidos: '++id, localId, numero, clienteId, syncStatus, createdAt, origen, embarqueId',
      clientes: '++id, localId, nombre, syncStatus, createdAt',
      syncQueue: '++id, table, operation, createdAt',
      requestQueue: '++id, offlineId, localEndpoint, createdAt',
    })
  }
}

export const offlineDb = new BambuOfflineDB()

export async function queuePedidoOffline(data: Omit<OfflinePedido, 'id' | 'localId' | 'syncStatus' | 'createdAt' | 'updatedAt'>) {
  const localId = generateUUID()
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
  const localId = generateUUID()
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
      logger.error({ err: e }, '[SYNC] Error processing queue item:')
      errors++
    }
  }

  return { processed, conflicts, errors }
}
