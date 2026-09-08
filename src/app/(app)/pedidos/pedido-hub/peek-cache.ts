import type { PedidoPeekExtras } from '@/modules/pedidos/application/dto'

/**
 * Caché de la capa 2 del peek del Pedido Hub (blueprint §4.3).
 *
 * Mismo patrón que `clientes-client/panel-prefetch.ts`:
 * - TTL 60s, alineado con el polling de la lista.
 * - LRU acotado (20) para no crecer sin límite.
 * - Dedup de promesas en vuelo.
 * - Solo se cachean éxitos; un fallo devuelve null y NO queda cacheado.
 * - fetch plano, NUNCA fetchResilient (GET de lectura, no encolar en Dexie).
 * - `invalidatePeek(id)` para invalidación SELECTIVA por evento realtime
 *   (blueprint §6.2: cada evento invalida solo el panel afectado).
 */

export type PeekLayer2 = Record<string, unknown> & PedidoPeekExtras & {
  // el resto del `pedido` enriquecido (nombreCli, factura, items con precio…)
  // llega tal cual del endpoint; lo tipamos laxo acá y estricto en el consumidor.
  factura?: unknown
}

const PEEK_TTL_MS = 60_000
const PEEK_CACHE_MAX = 20

type Entry = { data?: PeekLayer2; ts: number; promise?: Promise<PeekLayer2 | null> }

const cache = new Map<string, Entry>()

function isFresh(e: Entry): boolean {
  return Date.now() - e.ts < PEEK_TTL_MS
}

function evictIfNeeded(key: string): void {
  if (cache.size >= PEEK_CACHE_MAX && !cache.has(key)) {
    const first = cache.keys().next().value as string | undefined
    if (first) cache.delete(first)
  }
}

async function fetchPeek(id: string): Promise<PeekLayer2 | null> {
  try {
    const res = await fetch(`/api/pedidos/${id}`)
    if (!res.ok) return null
    const data = (await res.json()) as { success?: boolean; pedido?: PeekLayer2 }
    if (data?.success === false || !data.pedido) return null
    evictIfNeeded(id)
    cache.set(id, { data: data.pedido, ts: Date.now() })
    return data.pedido
  } catch {
    cache.delete(id)
    return null
  }
}

/** Carga la capa 2 con caché compartido. null = fallo (no queda cacheado). */
export function loadPeek(id: string): Promise<PeekLayer2 | null> {
  const entry = cache.get(id)
  if (entry?.data && !entry.promise && isFresh(entry)) return Promise.resolve(entry.data)
  if (entry?.promise) return entry.promise
  evictIfNeeded(id)
  const promise = fetchPeek(id).finally(() => {
    const e = cache.get(id)
    if (e) e.promise = undefined
  })
  cache.set(id, { data: entry?.data, ts: Date.now(), promise })
  return promise
}

/** Lectura síncrona de caché fresco (estado inicial del componente). */
export function peekCached(id: string): PeekLayer2 | null {
  const e = cache.get(id)
  return e?.data && !e.promise && isFresh(e) ? e.data : null
}

/** Invalida un solo peek — realtime selectivo (pedido/pago/embarque de ESE id). */
export function invalidatePeek(id: string): void {
  cache.delete(id)
}

/** Solo para tests. */
export function __resetPeekCache(): void {
  cache.clear()
}
