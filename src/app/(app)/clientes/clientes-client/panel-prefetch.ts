import type { ClienteStats, TimelineEvent } from './types'

/**
 * Caché + prefetch de las pestañas Stats e Historial del panel de cliente.
 *
 * Por qué existe: medido en producción (jul 2026), cada pestaña pagaba un
 * cold start de Vercel (~2.5s) + fan-out de queries Prisma al hacer click,
 * aunque las tablas son pequeñas. Como el usuario primero lee la pestaña
 * Info (2-3s mínimo), disparar ambas cargas al abrir el panel deja los
 * datos listos para cuando cambie de pestaña → render instantáneo.
 *
 * Diseño (mismo patrón que detailCache de index.tsx):
 * - TTL 60s alineado con el polling de la lista y con el detail cache.
 * - LRU acotado para no crecer sin límite.
 * - Dedup de promesas en vuelo: si el prefetch está cargando y el usuario
 *   entra a la pestaña, comparte la MISMA promesa (cero fetches duplicados).
 * - Solo se cachean éxitos: un fallo devuelve null y NO queda cacheado,
 *   así el siguiente intento (o el botón Reintentar) dispara un fetch nuevo.
 * - fetch plano, NUNCA fetchResilient: estos GETs de solo lectura no deben
 *   encolarse en Dexie requestQueue (polución de la cola offline).
 * - El historial solo se cachea en su vista default (meses=12, page=1):
 *   otros filtros/páginas van directo a la API como antes.
 */

export interface HistorialPage {
  events: TimelineEvent[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

const PANEL_TTL_MS = 60_000
const PANEL_CACHE_MAX = 20

type CacheEntry<T> = {
  data?: T
  ts: number
  promise?: Promise<T | null>
}

const statsCache = new Map<string, CacheEntry<ClienteStats>>()
const historialCache = new Map<string, CacheEntry<HistorialPage>>()

function isFresh<T>(entry: CacheEntry<T>): boolean {
  return Date.now() - entry.ts < PANEL_TTL_MS
}

function evictIfNeeded<T>(cache: Map<string, CacheEntry<T>>, key: string): void {
  if (cache.size >= PANEL_CACHE_MAX && !cache.has(key)) {
    const first = cache.keys().next().value as string | undefined
    if (first) cache.delete(first)
  }
}

function setCacheEntry<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
  evictIfNeeded(cache, key)
  cache.set(key, { data, ts: Date.now() })
}

async function fetchJson<T>(url: string): Promise<(T & { success?: boolean }) | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as T & { success?: boolean }
    if (data?.success === false) return null
    return data
  } catch {
    // Silencioso a propósito: esto corre en background (prefetch) y la UI
    // tiene su propio manejo de error con botón Reintentar.
    return null
  }
}

async function fetchAndCacheStats(clienteId: string): Promise<ClienteStats | null> {
  const data = await fetchJson<{ stats: ClienteStats }>(`/api/clientes/${clienteId}/stats`)
  if (data?.stats) {
    setCacheEntry(statsCache, clienteId, data.stats)
    return data.stats
  }
  statsCache.delete(clienteId)
  return null
}

async function fetchAndCacheHistorial(clienteId: string): Promise<HistorialPage | null> {
  const data = await fetchJson<HistorialPage>(
    `/api/clientes/${clienteId}/historial?meses=12&page=1&pageSize=20`,
  )
  if (data?.events) {
    const page: HistorialPage = {
      events: data.events,
      total: data.total,
      page: data.page,
      pageSize: data.pageSize,
      hasMore: data.hasMore,
    }
    setCacheEntry(historialCache, clienteId, page)
    return page
  }
  historialCache.delete(clienteId)
  return null
}

function load<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  fetcher: () => Promise<T | null>,
): Promise<T | null> {
  const entry = cache.get(key)
  if (entry?.data && !entry.promise && isFresh(entry)) {
    return Promise.resolve(entry.data)
  }
  if (entry?.promise) return entry.promise
  // Expulsar ANTES de insertar la entrada de promesa: si esperáramos a que
  // el fetch resuelva, la key ya existiría y la expulsión nunca ocurriría
  // (la caché crecería más allá del máximo).
  evictIfNeeded(cache, key)
  const promise = fetcher()
  cache.set(key, { data: entry?.data, ts: Date.now(), promise })
  return promise
}

/** Carga stats con caché compartido. null = fallo (no queda cacheado). */
export function loadClienteStats(clienteId: string): Promise<ClienteStats | null> {
  return load(statsCache, clienteId, () => fetchAndCacheStats(clienteId))
}

/** Carga historial (vista default) con caché compartido. null = fallo. */
export function loadClienteHistorial(clienteId: string): Promise<HistorialPage | null> {
  return load(historialCache, clienteId, () => fetchAndCacheHistorial(clienteId))
}

/** Lectura síncrona de caché fresco (para estado inicial de componentes). */
export function peekClienteStats(clienteId: string): ClienteStats | null {
  const entry = statsCache.get(clienteId)
  return entry?.data && !entry.promise && isFresh(entry) ? entry.data : null
}

/** Lectura síncrona de caché fresco (para estado inicial de componentes). */
export function peekClienteHistorial(clienteId: string): HistorialPage | null {
  const entry = historialCache.get(clienteId)
  return entry?.data && !entry.promise && isFresh(entry) ? entry.data : null
}

/**
 * Dispara la carga de ambas pestañas en background al abrir el panel.
 * Fire-and-forget: los resultados quedan en caché para cuando el usuario
 * cambie de pestaña.
 */
export function prefetchClientePanel(clienteId: string): void {
  void loadClienteStats(clienteId)
  void loadClienteHistorial(clienteId)
}

/**
 * Invalida ambas cachés. Se llama cuando llegan eventos realtime de
 * pedido/pago/embarque (las entidades que alimentan stats e historial).
 * Nota: facturas/abonos/notas de crédito no tienen eventos realtime
 * (ver RealtimeEntity en lib/realtime.ts) — su staleness queda acotado
 * por el TTL de 60s.
 */
export function invalidateClientePanelCaches(): void {
  statsCache.clear()
  historialCache.clear()
}

/** Solo para tests. */
export function __resetPanelCaches(): void {
  invalidateClientePanelCaches()
}
