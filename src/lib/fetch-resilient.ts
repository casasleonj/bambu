/**
 * fetchResilient — offline-first HTTP wrapper.
 *
 * En lugar de hacer fetch y fallar con toast.error cuando no hay red,
 * encola la request en IndexedDB (Dexie) y deja que el worker de sync
 * la reintente cuando vuelva la conexión.
 *
 * Estrategia: encolar al primer fallo de red (sin retry con backoff).
 * - Evita retry storms (Google SRE / Polly: "Retry storm is the most
 *   common outage amplifier").
 * - Mantiene la UI responsive (sin spinners bloqueados).
 * - Dedup: cada request lleva un `offlineId` (UUID) que el server
 *   usa para evitar duplicados al reenviar.
 *
 * Feature flag: `USE_RESILIENT_FETCH=false` desactiva el wrapper
 * y los hooks vuelven a `fetch` directo (rollback inmediato).
 */

import { offlineDb } from './db/offline'
import { logger } from './logger'

export interface ResilientRequest {
  url: string
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body: unknown
  offlineId: string
  localEndpoint: string // e.g. "crear-pedido" para logs/toast
}

export type ResilientResult<T> =
  | { status: 'ok'; data: T; statusCode: number }
  | { status: 'offline'; localId: string }
  | { status: 'error'; error: string; statusCode: number }

const DEFAULT_TIMEOUT_MS = 10_000

function isResilientEnabled(): boolean {
  // Default ON en dev/prod. Override con env var para rollback.
  const flag = process.env.NEXT_PUBLIC_USE_RESILIENT_FETCH
  if (flag === 'false') return false
  if (flag === 'true') return true
  return true // default: ON
}

async function encolarResilient(req: ResilientRequest): Promise<void> {
  await offlineDb.requestQueue.add({
    url: req.url,
    method: req.method,
    body: JSON.stringify(req.body),
    offlineId: req.offlineId,
    localEndpoint: req.localEndpoint,
    createdAt: new Date(),
  })
  logger.info(
    { localId: req.offlineId, endpoint: req.localEndpoint, url: req.url },
    'Encolado offline: request reencolada para sync'
  )
}

/**
 * Wrapper de fetch con timeout + fallback a cola offline.
 *
 * Detecta fallos de red (TypeError: fetch failed, AbortError por timeout)
 * y los encola en IndexedDB. Los fallos de validación del server (4xx/5xx)
 * NO se encolan — esos son errores de lógica que el usuario debe ver.
 */
export async function fetchResilient<T = unknown>(
  url: string,
  init: { method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; localEndpoint: string }
): Promise<ResilientResult<T>> {
  const offlineId = crypto.randomUUID()
  const method = init.method

  if (!isResilientEnabled()) {
    // Modo rollback: fetch directo sin offline-first
    return fetchDirect<T>(url, init)
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    let data: T
    try {
      data = (await res.json()) as T
    } catch {
      // Respuesta no-JSON: tratamos como texto
      data = (await res.text()) as unknown as T
    }

    if (res.ok) {
      return { status: 'ok', data, statusCode: res.status }
    }

    // 4xx/5xx NO son fallos de red — son respuestas del server.
    // Devolvemos error para que el hook muestre el mensaje al usuario.
    const errMsg =
      (data as { error?: { message?: string } })?.error?.message ||
      `Error ${res.status} en ${init.localEndpoint}`
    return { status: 'error', error: errMsg, statusCode: res.status }
  } catch (err) {
    clearTimeout(timeoutId)
    // TypeError = fetch failed (network down)
    // AbortError = timeout
    const isNetworkError = err instanceof TypeError
    const isTimeout = err instanceof DOMException && err.name === 'AbortError'

    if (isNetworkError || isTimeout) {
      await encolarResilient({
        url,
        method,
        body: init.body,
        offlineId,
        localEndpoint: init.localEndpoint,
      })
      return { status: 'offline', localId: offlineId }
    }

    // Otro error (programming error, etc.) — no encolar
    const errMsg = err instanceof Error ? err.message : 'Error desconocido'
    logger.error({ err: errMsg, endpoint: init.localEndpoint }, 'fetchResilient: error no esperado')
    return { status: 'error', error: errMsg, statusCode: 0 }
  }
}

async function fetchDirect<T>(
  url: string,
  init: { method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown }
): Promise<ResilientResult<T>> {
  try {
    const res = await fetch(url, {
      method: init.method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: init.body ? JSON.stringify(init.body) : undefined,
    })
    const data = (await res.json()) as T
    if (res.ok) return { status: 'ok', data, statusCode: res.status }
    const errMsg =
      (data as { error?: { message?: string } })?.error?.message ||
      `Error ${res.status}`
    return { status: 'error', error: errMsg, statusCode: res.status }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Error desconocido'
    return { status: 'error', error: errMsg, statusCode: 0 }
  }
}
