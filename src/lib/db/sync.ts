import { offlineDb } from './offline'
import { logger } from '@/lib/logger'

const BATCH_SIZE = 25 // Drain N items per batch to avoid long blocking sync
const SYNC_TIMEOUT_MS = 60_000 // 1 minuto máximo por request

// Sprint 6 (G-2): DLQ + backoff. Constantes ajustables.
const MAX_ATTEMPTS = 100 // Tras N intentos, mover a failedItems (industry: 802.3 usa 10, pero offline-first tolera más)
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 días
const BACKOFF_BASE_MS = 200
const BACKOFF_MAX_MS = 30_000
const BACKOFF_JITTER_MS = 1000

export interface SyncResult {
  synced: number
  failed: number
  conflicts: number
  remaining: number
  drained: boolean
  failedPermanently: number
  sessionExpired: boolean
  alreadyRunning?: boolean
}

// Mutex: evita que múltiples llamadas a syncWithServer corran en paralelo.
let syncPromise: Promise<SyncResult> | null = null

/**
 * Sprint 6 (G-2): determina si un status HTTP es retryable.
 */
export function isRetryableStatus(status: number): boolean {
  if (status === 401) return false
  if (status === 409) return false
  if (status === 429) return true
  if (status >= 400 && status < 500) return false
  if (status >= 500) return true
  return true
}

/**
 * Calcula backoff exponencial con jitter (AWS Builders Library pattern).
 */
export function calculateBackoff(attempts: number, randomFn?: () => number): number {
  const exponential = Math.min(BACKOFF_BASE_MS * Math.pow(2, attempts), BACKOFF_MAX_MS)
  const jitter = (randomFn ?? Math.random)() * BACKOFF_JITTER_MS
  return exponential + jitter
}

/**
 * Sprint 6 (G-2): determina si un item debe moverse a DLQ.
 */
export function shouldMoveToDLQ(item: { attempts?: number; createdAt: Date }): boolean {
  const attempts = item.attempts ?? 0
  const ageMs = Date.now() - item.createdAt.getTime()
  return attempts >= MAX_ATTEMPTS || ageMs >= MAX_AGE_MS
}

/**
 * Sprint 6 (G-2): mover un item a la tabla failedItems (DLQ).
 */
async function moveToDLQ(
  req: {
    id?: number
    url: string
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    body: string
    offlineId: string
    localEndpoint: string
    createdAt: Date
    attempts?: number
    lastAttemptAt?: Date
    lastError?: string
  },
  error: string,
): Promise<void> {
  await offlineDb.failedItems.add({
    url: req.url,
    method: req.method,
    body: req.body,
    offlineId: req.offlineId,
    localEndpoint: req.localEndpoint,
    attempts: req.attempts ?? 0,
    lastError: error,
    firstAttemptAt: req.createdAt,
    failedAt: new Date(),
  })
  await offlineDb.requestQueue.delete(req.id!)
  logger.error(
    {
      localId: req.offlineId,
      endpoint: req.localEndpoint,
      attempts: req.attempts,
      error,
    },
    'Sync: item movido a DLQ (failedItems)',
  )
}

export async function syncWithServer(): Promise<SyncResult> {
  if (syncPromise) {
    return { synced: 0, failed: 0, conflicts: 0, remaining: 0, drained: false, failedPermanently: 0, sessionExpired: false, alreadyRunning: true }
  }
  syncPromise = doSyncWithServer().finally(() => {
    syncPromise = null
  })
  return syncPromise
}

async function doSyncWithServer(): Promise<SyncResult> {
  const legacyQueue = await offlineDb.syncQueue.orderBy('createdAt').limit(BATCH_SIZE).toArray()
  const requestQueue = await offlineDb.requestQueue.orderBy('createdAt').limit(BATCH_SIZE).toArray()
  let synced = 0
  let failed = 0
  let conflicts = 0
  let failedPermanently = 0
  let sessionExpired = false

  // 1) Migrar syncQueue legacy a requestQueue (una sola vez, luego se borra).
  for (const item of legacyQueue) {
    try {
      if (item.table === 'pedidos' && item.operation === 'create') {
        const pedido = await offlineDb.pedidos.where('localId').equals(item.localId).first()
        if (!pedido || pedido.syncStatus !== 'pending') {
          await offlineDb.syncQueue.delete(item.id!)
          continue
        }

        const isVentaLibre = pedido.origen === 'VENTA_LIBRE'
        const body = isVentaLibre
          ? {
              clienteId: pedido.clienteId,
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

        await offlineDb.requestQueue.add({
          url: isVentaLibre ? '/api/pedidos/venta-libre' : '/api/pedidos',
          method: 'POST',
          body: JSON.stringify(body),
          offlineId: pedido.localId,
          localEndpoint: isVentaLibre ? 'venta-libre' : 'pedido',
          createdAt: item.createdAt,
        })
        await offlineDb.syncQueue.delete(item.id!)
      } else if (item.table === 'clientes' && item.operation === 'create') {
        const cliente = await offlineDb.clientes.where('localId').equals(item.localId).first()
        if (!cliente || cliente.syncStatus !== 'pending') {
          await offlineDb.syncQueue.delete(item.id!)
          continue
        }

        await offlineDb.requestQueue.add({
          url: '/api/clientes',
          method: 'POST',
          body: JSON.stringify({
            nombre: cliente.nombre,
            telefono: cliente.telefono,
            direccion: cliente.direccion,
            barrio: cliente.barrio,
            rutaId: cliente.rutaId,
          }),
          offlineId: cliente.localId,
          localEndpoint: 'cliente',
          createdAt: item.createdAt,
        })
        await offlineDb.syncQueue.delete(item.id!)
      } else {
        // syncQueue legacy no soportado: eliminar para no bloquear.
        await offlineDb.syncQueue.delete(item.id!)
      }
    } catch (e) {
      logger.error({ err: e instanceof Error ? e.message : 'Unknown', id: item.id }, 'Sync: failed to migrate legacy syncQueue item')
    }
  }

  // 2) Procesar requestQueue con timeout, retry, DLQ y 401 sin purge.
  for (const req of requestQueue) {
    const newAttempts = (req.attempts ?? 0) + 1
    await offlineDb.requestQueue.update(req.id!, {
      attempts: newAttempts,
      lastAttemptAt: new Date(),
    })

    if (shouldMoveToDLQ({ ...req, attempts: newAttempts })) {
      await moveToDLQ(req, 'Excedido MAX_ATTEMPTS o MAX_AGE')
      await markOfflineItemConflict(req.offlineId)
      failedPermanently++
      continue
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS)

    try {
      const res = await fetch(req.url, {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: req.body,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      // 401: sesión expirada. NO purgar cola; redirigir a login.
      if (res.status === 401) {
        sessionExpired = true
        logger.error(
          { localId: req.offlineId, endpoint: req.localEndpoint },
          'Sync: 401 recibido, sesión expirada — cola conservada, forzar logout',
        )
        if (typeof window !== 'undefined') {
          window.location.href = '/login?reason=expired'
        }
        return { synced, failed, conflicts, remaining: 0, drained: true, failedPermanently, sessionExpired }
      }

      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        await finalizeRequestQueueItem(req, data, 'synced')
        synced++
        logger.info(
          { localId: req.offlineId, endpoint: req.localEndpoint, attempts: newAttempts },
          'Sync: request completada',
        )
      } else if (res.status === 409) {
        const data = await res.json().catch(() => ({}))
        await finalizeRequestQueueItem(req, data, 'synced')
        conflicts++
        logger.warn(
          { localId: req.offlineId, endpoint: req.localEndpoint, status: 409 },
          'Sync: conflict resuelto por server (dedup)',
        )
      } else if (res.status === 429) {
        const retryAfter = Number(res.headers.get('Retry-After') || 60)
        await offlineDb.requestQueue.update(req.id!, {
          lastError: `429: retry after ${retryAfter}s`,
        })
        failed++
        logger.warn(
          { localId: req.offlineId, endpoint: req.localEndpoint, retryAfter },
          'Sync: 429 rate limit, mantener en cola con backoff',
        )
      } else if (!isRetryableStatus(res.status)) {
        await moveToDLQ(
          { ...req, attempts: newAttempts, lastAttemptAt: new Date() },
          `HTTP ${res.status}: error de cliente`,
        )
        await markOfflineItemConflict(req.offlineId)
        failedPermanently++
        logger.error(
          { localId: req.offlineId, endpoint: req.localEndpoint, status: res.status },
          'Sync: 4xx error de lógica, movido a DLQ',
        )
      } else {
        await offlineDb.requestQueue.update(req.id!, {
          lastError: `HTTP ${res.status}`,
        })
        failed++
        logger.warn(
          { localId: req.offlineId, endpoint: req.localEndpoint, status: res.status, attempts: newAttempts },
          'Sync: error retryable, mantener en cola',
        )
      }
    } catch (e) {
      clearTimeout(timeoutId)
      const errMsg = e instanceof Error ? e.message : 'Unknown error'
      await offlineDb.requestQueue.update(req.id!, {
        lastError: `Network: ${errMsg}`,
      })
      failed++
      logger.error(
        { err: errMsg, id: req.id, attempts: newAttempts },
        'Sync: request falló de red, se mantiene',
      )
    }

    const isLast = req === requestQueue[requestQueue.length - 1]
    if (!isLast) {
      await new Promise((r) => setTimeout(r, calculateBackoff(newAttempts)))
    }
  }

  const remainingRequest = await offlineDb.requestQueue.count()
  const remainingSync = await offlineDb.syncQueue.count()
  const remaining = remainingRequest + remainingSync

  if (failedPermanently > 0) {
    logger.warn(
      { failedPermanently, synced, failed, conflicts },
      'Sync: items movidos a DLQ requieren revisión manual',
    )
  }

  return {
    synced,
    failed,
    conflicts,
    remaining,
    drained: remaining === 0,
    failedPermanently,
    sessionExpired,
  }
}

async function finalizeRequestQueueItem(
  req: {
    id?: number
    offlineId?: string
  },
  serverData: Record<string, unknown>,
  status: 'synced' | 'conflict',
): Promise<void> {
  if (!req.offlineId) {
    await offlineDb.requestQueue.delete(req.id!)
    return
  }

  const pedido = await offlineDb.pedidos.where('localId').equals(req.offlineId).first()
  if (pedido) {
    const serverPedido = (serverData.pedido || serverData) as { id?: string; numero?: number } | undefined
    await offlineDb.transaction('rw', offlineDb.pedidos, offlineDb.requestQueue, async () => {
      await offlineDb.pedidos.where('localId').equals(req.offlineId!).modify({
        syncStatus: status,
        numero: serverPedido?.numero ?? pedido.numero,
      })
      await offlineDb.requestQueue.delete(req.id!)
    })
    return
  }

  const cliente = await offlineDb.clientes.where('localId').equals(req.offlineId).first()
  if (cliente) {
    await offlineDb.transaction('rw', offlineDb.clientes, offlineDb.requestQueue, async () => {
      await offlineDb.clientes.where('localId').equals(req.offlineId!).modify({
        syncStatus: status,
      })
      await offlineDb.requestQueue.delete(req.id!)
    })
    return
  }

  await offlineDb.requestQueue.delete(req.id!)
}

async function markOfflineItemConflict(offlineId?: string): Promise<void> {
  if (!offlineId) return
  const pedido = await offlineDb.pedidos.where('localId').equals(offlineId).first()
  if (pedido) {
    await offlineDb.pedidos.where('localId').equals(offlineId).modify({ syncStatus: 'conflict' })
    return
  }
  const cliente = await offlineDb.clientes.where('localId').equals(offlineId).first()
  if (cliente) {
    await offlineDb.clientes.where('localId').equals(offlineId).modify({ syncStatus: 'conflict' })
  }
}

export function isOnline(): boolean {
  return navigator.onLine
}
