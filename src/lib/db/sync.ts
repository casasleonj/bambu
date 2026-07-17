import { offlineDb } from './offline'
import { logger } from '@/lib/logger'

const BATCH_SIZE = 25 // Drain N items per batch to avoid long blocking sync

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
}

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
  const queue = await offlineDb.syncQueue.orderBy('createdAt').limit(BATCH_SIZE).toArray()
  const requestQueue = await offlineDb.requestQueue.orderBy('createdAt').limit(BATCH_SIZE).toArray()
  let synced = 0
  let failed = 0
  let conflicts = 0
  let failedPermanently = 0
  let sessionExpired = false

  // 1) Replay de requests crudas encoladas por fetchResilient()
  for (const req of requestQueue) {
    const newAttempts = (req.attempts ?? 0) + 1
    await offlineDb.requestQueue.update(req.id!, {
      attempts: newAttempts,
      lastAttemptAt: new Date(),
    })

    if (shouldMoveToDLQ({ ...req, attempts: newAttempts })) {
      await moveToDLQ(req, 'Excedido MAX_ATTEMPTS o MAX_AGE')
      failedPermanently++
      continue
    }

    try {
      const res = await fetch(req.url, {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: req.body,
      })

      // 401: sesión expirada. Purgar cola y forzar logout.
      if (res.status === 401) {
        sessionExpired = true
        await offlineDb.requestQueue.clear()
        await offlineDb.syncQueue.clear()
        logger.error(
          { localId: req.offlineId, endpoint: req.localEndpoint },
          'Sync: 401 recibido, sesión expirada — cola purgada, forzar logout',
        )
        if (typeof window !== 'undefined') {
          window.location.href = '/login?reason=expired'
        }
        return { synced, failed, conflicts, remaining: 0, drained: true, failedPermanently, sessionExpired }
      }

      if (res.ok) {
        await offlineDb.requestQueue.delete(req.id!)
        synced++
        logger.info(
          { localId: req.offlineId, endpoint: req.localEndpoint, attempts: newAttempts },
          'Sync: request reencolada completada',
        )
      } else if (res.status === 409) {
        await offlineDb.requestQueue.delete(req.id!)
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
        logger.warn(
          { localId: req.offlineId, endpoint: req.localEndpoint, retryAfter },
          'Sync: 429 rate limit, mantener en cola',
        )
        failed++
        if (retryAfter * 1000 > BACKOFF_MAX_MS) {
          await new Promise((r) => setTimeout(r, retryAfter * 1000))
        }
      } else if (!isRetryableStatus(res.status)) {
        const errorMsg = `HTTP ${res.status}: error de cliente`
        await moveToDLQ(
          { ...req, attempts: newAttempts, lastAttemptAt: new Date() },
          errorMsg,
        )
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
      const errMsg = e instanceof Error ? e.message : 'Unknown error'
      await offlineDb.requestQueue.update(req.id!, {
        lastError: `Network: ${errMsg}`,
      })
      failed++
      logger.error(
        { err: errMsg, id: req.id, attempts: newAttempts },
        'Sync: request reencolada falló de red, se mantiene',
      )
    }

    const isLast = req === requestQueue[requestQueue.length - 1]
    if (!isLast) {
      await new Promise((r) => setTimeout(r, calculateBackoff(newAttempts)))
    }
  }

  // 2) syncQueue legacy (pedidos/clientes)
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

        if (res.status === 401) {
          sessionExpired = true
          await offlineDb.requestQueue.clear()
          await offlineDb.syncQueue.clear()
          if (typeof window !== 'undefined') {
            window.location.href = '/login?reason=expired'
          }
          return { synced, failed, conflicts, remaining: 0, drained: true, failedPermanently, sessionExpired }
        }

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
        } else if (!isRetryableStatus(res.status)) {
          await offlineDb.pedidos.where('localId').equals(item.localId).modify({
            syncStatus: 'conflict',
          })
          await offlineDb.syncQueue.delete(item.id!)
          failedPermanently++
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

        if (res.status === 401) {
          sessionExpired = true
          await offlineDb.requestQueue.clear()
          await offlineDb.syncQueue.clear()
          if (typeof window !== 'undefined') {
            window.location.href = '/login?reason=expired'
          }
          return { synced, failed, conflicts, remaining: 0, drained: true, failedPermanently, sessionExpired }
        }

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
        } else if (!isRetryableStatus(res.status)) {
          await offlineDb.clientes.where('localId').equals(item.localId).modify({
            syncStatus: 'conflict',
          })
          await offlineDb.syncQueue.delete(item.id!)
          failedPermanently++
        } else {
          failed++
        }
      }
    } catch (e) {
      logger.error({ err: e instanceof Error ? e.message : 'Unknown', id: (item as any).id }, 'Sync failed for item')
      failed++
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

export function isOnline(): boolean {
  return navigator.onLine
}
