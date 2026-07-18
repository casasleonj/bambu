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
import { generateUUID } from './uuid'
import { logger } from './logger'
import { AUTH_EXPIRED_EVENT } from './auth-events'

export interface ResilientRequest {
  url: string
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body: unknown
  offlineId: string
  localEndpoint: string // e.g. "crear-pedido" para logs/toast
}

export type ResilientResult<T> =
  | { status: 'ok'; data: T; statusCode: number }
  | { status: 'offline'; localId: string; reason: 'network' | 'timeout' }
  | { status: 'error'; error: string; statusCode: number }

const DEFAULT_TIMEOUT_MS = 10_000
// Para mutaciones de creación (POST) que pueden tardar >10s en Vercel Hobby
// cold-start, los callers pasan `timeoutMs` para subir el AbortController.
// El default se mantiene en 10s para no romper behaviour históric de GET.
const MAX_QUEUE_SIZE = 500 // Backpressure: cap encolado para evitar unbounded growth

function buildErrorDetails(error?: { formErrors?: string[]; fieldErrors?: Record<string, string[]> }): string {
  if (!error) return ''
  const parts: string[] = []
  if (error.formErrors?.length) {
    parts.push(error.formErrors.join('; '))
  }
  if (error.fieldErrors) {
    for (const [field, messages] of Object.entries(error.fieldErrors)) {
      if (messages?.length) parts.push(`${field}: ${messages.join(', ')}`)
    }
  }
  return parts.join('; ')
}

function isResilientEnabled(): boolean {
  // Default ON en dev/prod. Override con env var para rollback.
  const flag = process.env.NEXT_PUBLIC_USE_RESILIENT_FETCH
  if (flag === 'false') return false
  if (flag === 'true') return true
  return true // default: ON
}

async function encolarResilient(req: ResilientRequest): Promise<{ enqueued: boolean; queueSize: number }> {
  // Backpressure: si la cola está llena, NO encolamos más.
  // El cliente debe ver un error y decidir (mostrar warning, reducir ritmo, etc.)
  const currentSize = await offlineDb.requestQueue.count()
  if (currentSize >= MAX_QUEUE_SIZE) {
    logger.warn(
      { endpoint: req.localEndpoint, queueSize: currentSize, max: MAX_QUEUE_SIZE },
      'Cola offline llena — request NO encolada (backpressure)'
    )
    return { enqueued: false, queueSize: currentSize }
  }
  await offlineDb.requestQueue.add({
    url: req.url,
    method: req.method,
    body: JSON.stringify(req.body),
    offlineId: req.offlineId,
    localEndpoint: req.localEndpoint,
    createdAt: new Date(),
  })
  logger.info(
    { localId: req.offlineId, endpoint: req.localEndpoint, url: req.url, queueSize: currentSize + 1 },
    'Encolado offline: request reencolada para sync'
  )
  return { enqueued: true, queueSize: currentSize + 1 }
}

/**
 * Notifica a los componentes client-side que la sesión fue rechazada por el
 * servidor (401/403). El SessionExpiryGuard escucha este evento y redirige al
 * login. Se ignora para endpoints internos de Auth.js para evitar duplicar la
 * lógica que el SessionProvider ya maneja.
 */
function dispatchAuthExpired(url: string, statusCode: number, endpoint: string): void {
  if (typeof window === 'undefined') return
  if (url.startsWith('/api/auth/')) return
  if (statusCode !== 401 && statusCode !== 403) return
  logger.warn(
    { url, statusCode, endpoint },
    'fetchResilient: sesión rechazada por el servidor',
  )
  window.dispatchEvent(
    new CustomEvent(AUTH_EXPIRED_EVENT, { detail: { statusCode, url } }),
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
  init: { method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; localEndpoint: string; timeoutMs?: number }
): Promise<ResilientResult<T>> {
  // Si el body trae offlineId (lo generan los hooks para dedup server-side),
  // lo extraemos y lo usamos también en la cola. Si no, generamos uno nuevo.
  // Esto garantiza que la cola y el body usan el MISMO UUID → el server
  // deduplica correctamente al reenviar.
  const bodyOfflineId =
    init.body && typeof init.body === 'object' && 'offlineId' in init.body
      ? (init.body as { offlineId?: string }).offlineId
      : undefined
  const offlineId = bodyOfflineId ?? generateUUID()
  const method = init.method
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS

  if (!isResilientEnabled()) {
    // Modo rollback: fetch directo sin offline-first
    return fetchDirect<T>(url, init)
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

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

    dispatchAuthExpired(url, res.status, init.localEndpoint)

    // 4xx/5xx NO son fallos de red — son respuestas del server.
    // Devolvemos error para que el hook muestre el mensaje al usuario.
    // Incluimos detalles de validación si el server los envía.
    const serverError = (data as { error?: { message?: string; formErrors?: string[]; fieldErrors?: Record<string, string[]> } })?.error
    const details = buildErrorDetails(serverError)
    const errMsg = serverError?.message
      ? `${serverError.message}${details ? ` (${details})` : ''}`
      : `Error ${res.status} en ${init.localEndpoint}`
    return { status: 'error', error: errMsg, statusCode: res.status }
  } catch (err) {
    clearTimeout(timeoutId)
    // TypeError = fetch failed (network down)
    // AbortError = timeout
    const isNetworkError = err instanceof TypeError
    const isTimeout = err instanceof DOMException && err.name === 'AbortError'

    if (isNetworkError || isTimeout) {
      // Distinguimos la causa del offline para que el caller pueda reaccionar:
      //   - 'network': navigator.onLine=false o sin respuesta del DNS/TCP.
      //     Encolar en IndexedDB es correcto (la request llegará cuando vuelva
      //     la red y el sync la reintente).
      //   - 'timeout': el AbortController disparó por superar timeoutMs.
      //     El server pudo haber procesado la request — encolar duplica riesgo
      //     de phantom enqueue. El caller debe decidir qué hacer (toast honesto /
      //     Reintentar / Cancelar) en lugar de cerrar siempre como 'offline'
      const reason: 'network' | 'timeout' = isTimeout ? 'timeout' : 'network'
      const { enqueued, queueSize } = await encolarResilient({
        url,
        method,
        body: init.body,
        offlineId,
        localEndpoint: init.localEndpoint,
      })
      if (!enqueued) {
        // Backpressure: cola llena. Devolver error para que el caller muestre toast.error
        // y NO simule éxito offline. El usuario debe decidir (reducir ritmo, esperar sync).
        return {
          status: 'error',
          error: `Cola offline llena (${queueSize}/${MAX_QUEUE_SIZE}). Espera a que se sincronicen los cambios pendientes.`,
          statusCode: 0,
        }
      }
      return { status: 'offline', localId: offlineId, reason }
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
    dispatchAuthExpired(url, res.status, 'direct')
    const serverError = (data as { error?: { message?: string; formErrors?: string[]; fieldErrors?: Record<string, string[]> } })?.error
    const details = buildErrorDetails(serverError)
    const errMsg = serverError?.message
      ? `${serverError.message}${details ? ` (${details})` : ''}`
      : `Error ${res.status}`
    return { status: 'error', error: errMsg, statusCode: res.status }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Error desconocido'
    return { status: 'error', error: errMsg, statusCode: 0 }
  }
}
