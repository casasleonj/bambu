import { generateUUID } from '../uuid'
import Dexie, { type Table } from 'dexie'

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
  // Sprint 6 (G-2 DLQ): tracking de reintentos para evitar loops
  // infinitos y distinguir errores retryable de errores permanentes.
  attempts?: number
  lastAttemptAt?: Date
  lastError?: string
}

/**
 * Sprint 6 (G-2): Failed Items (Dead Letter Queue).
 * Items que exceden 100 intentos o 7 días se mueven acá para
 * revisión manual del admin. No se reintentan automáticamente.
 */
export interface FailedItem {
  id?: number
  url: string
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body: string
  offlineId: string
  localEndpoint: string
  attempts: number
  lastError: string
  firstAttemptAt: Date
  failedAt: Date
}

class BambuOfflineDB extends Dexie {
  pedidos!: Table<OfflinePedido, number>
  clientes!: Table<OfflineCliente, number>
  syncQueue!: Table<SyncQueueItem, number>
  requestQueue!: Table<OfflineRequest, number>
  failedItems!: Table<FailedItem, number>

  constructor() {
    super('BambuOfflineDB')
    this.version(3).stores({
      pedidos: '++id, localId, numero, clienteId, syncStatus, createdAt, origen, embarqueId',
      clientes: '++id, localId, nombre, syncStatus, createdAt',
      syncQueue: '++id, table, operation, createdAt',
    })
    this.version(4).stores({
      pedidos: '++id, localId, numero, clienteId, syncStatus, createdAt, origen, embarqueId',
      clientes: '++id, localId, nombre, syncStatus, createdAt',
      syncQueue: '++id, table, operation, createdAt',
      requestQueue: '++id, offlineId, localEndpoint, createdAt',
    })
    // v5 (Sprint 6 §G-2): agrega índices para DLQ y tracking de reintentos.
    this.version(5).stores({
      pedidos: '++id, localId, numero, clienteId, syncStatus, createdAt, origen, embarqueId',
      clientes: '++id, localId, nombre, syncStatus, createdAt',
      syncQueue: '++id, table, operation, createdAt',
      requestQueue: '++id, offlineId, localEndpoint, createdAt, lastAttemptAt',
      failedItems: '++id, offlineId, localEndpoint, failedAt, attempts',
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


