import { fetchWithTimeout, FetchTimeoutError } from '@/lib/fetch-timeout'

/**
 * Caché compartida (entre módulos/páginas) del detalle de un cliente
 * (GET /api/clientes/[id]) — incluye `frecuenciaSugerida`/`productosSugeridos`
 * calculados server-side a partir de sus últimos pedidos entregados.
 *
 * Por qué existe: `/pedidos?new=1&clienteId=X` (link "Crear Pedido" desde
 * `/clientes`) bloqueaba la apertura del modal en un `GET /api/clientes?all=true`
 * sin paginar (toda la tabla, 4 relaciones) solo para encontrar el ÚNICO
 * cliente ya conocido por id. Este módulo permite pedir SOLO ese cliente,
 * y comparte caché con cualquier otro caller (p. ej. el hover de fila en
 * `/clientes`, que ya calienta este mismo endpoint) sin acoplarse al tipo
 * `Cliente` rico de `clientes-client` — es genérico a propósito.
 *
 * No reemplaza ni modifica el caché local de `clientes-client/index.tsx`
 * (deliberado: ese módulo ya tuvo regresiones sutiles documentadas en
 * AGENTS.md #19/#22 y no hace falta tocarlo para este fix).
 */

const DETAIL_TTL_MS = 60_000
const DETAIL_CACHE_MAX = 50
const FETCH_TIMEOUT_MS = 30_000

export type ClienteDetailResult<T> =
  | { ok: true; cliente: T }
  | { ok: false; status: number; error: string }

type CacheEntry<T> = {
  data?: T
  ts: number
  promise?: Promise<ClienteDetailResult<T>>
}

// `unknown` a propósito: cada caller castea al tipo que necesita vía el
// parámetro genérico de `loadClienteDetail`/`fetchClienteDetailFresh`.
const cache = new Map<string, CacheEntry<unknown>>()

function isFresh(entry: CacheEntry<unknown>): boolean {
  return Date.now() - entry.ts < DETAIL_TTL_MS
}

function evictIfNeeded(id: string): void {
  if (cache.size >= DETAIL_CACHE_MAX && !cache.has(id)) {
    const first = cache.keys().next().value as string | undefined
    if (first) cache.delete(first)
  }
}

function parseResponse<T>(res: Response, data: { cliente?: T }): ClienteDetailResult<T> {
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error:
        res.status === 404
          ? 'Cliente no encontrado.'
          : `Error al cargar el cliente (HTTP ${res.status}). Intenta de nuevo.`,
    }
  }
  if (!data.cliente) {
    return { ok: false, status: 500, error: 'Respuesta inesperada del servidor.' }
  }
  return { ok: true, cliente: data.cliente }
}

async function fetchDetail<T>(id: string): Promise<ClienteDetailResult<T>> {
  try {
    const res = await fetchWithTimeout(`/api/clientes/${id}`, {}, FETCH_TIMEOUT_MS)
    const data = await res.json()
    return parseResponse<T>(res, data)
  } catch (err) {
    if (err instanceof FetchTimeoutError) {
      return { ok: false, status: 0, error: 'La conexión tardó demasiado. Intenta de nuevo.' }
    }
    return { ok: false, status: 0, error: 'No se pudo conectar al servidor. Verifica tu conexión e intenta de nuevo.' }
  }
}

async function fetchAndCache<T>(id: string): Promise<ClienteDetailResult<T>> {
  const result = await fetchDetail<T>(id)
  if (result.ok) {
    evictIfNeeded(id)
    cache.set(id, { data: result.cliente, ts: Date.now() })
  } else {
    cache.delete(id)
  }
  return result
}

/**
 * Carga el detalle de un cliente con caché compartida (TTL 60s, LRU 50,
 * dedupe de promesas en vuelo — mismo patrón que `panel-prefetch.ts`).
 * Instantáneo si ya está fresco en caché (p. ej. calentado por un hover
 * previo); si no, dispara un único fetch compartido por cualquier caller
 * concurrente para el mismo id.
 */
export function loadClienteDetail<T = unknown>(id: string): Promise<ClienteDetailResult<T>> {
  const entry = cache.get(id) as CacheEntry<T> | undefined
  if (entry?.data && !entry.promise && isFresh(entry)) {
    return Promise.resolve({ ok: true, cliente: entry.data })
  }
  if (entry?.promise) return entry.promise
  evictIfNeeded(id)
  const promise = fetchAndCache<T>(id)
  cache.set(id, { data: entry?.data, ts: Date.now(), promise } as CacheEntry<unknown>)
  return promise
}

/** Precalienta el caché sin esperar el resultado (fire-and-forget). */
export function warmClienteDetail(id: string): void {
  void loadClienteDetail(id)
}

/**
 * Fetch SIEMPRE fresco (sin caché, `cache: 'no-store'`), para revalidar
 * campos sensibles a staleness (dirección/barrio/teléfono de despacho)
 * que no deben depender de una entrada de caché de hasta 60s. No escribe
 * en el caché de `loadClienteDetail` a propósito, para no pisar una
 * entrada más reciente escrita por otro caller concurrente.
 * Acepta un `AbortSignal` externo para que el caller pueda cancelar si
 * el componente se desmonta o el cliente seleccionado cambia.
 */
export async function fetchClienteDetailFresh<T = unknown>(
  id: string,
  signal?: AbortSignal,
): Promise<ClienteDetailResult<T>> {
  try {
    const res = await fetch(`/api/clientes/${id}`, { cache: 'no-store', signal })
    const data = await res.json()
    return parseResponse<T>(res, data)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, status: 0, error: 'Cancelado.' }
    }
    return { ok: false, status: 0, error: 'No se pudo conectar al servidor. Verifica tu conexión e intenta de nuevo.' }
  }
}

/**
 * Warm-up defensivo para el link "Crear Pedido" (hover/focus) en /clientes:
 * precalienta lo que /pedidos necesita para abrir el modal rápido — el
 * detalle del cliente (esta caché), la config de productos/tabla de precios
 * (no dependen del cliente, se usan siempre) y el chunk JS del formulario.
 * GETs idempotentes, sin efectos secundarios. En el caso común esto ya está
 * tibio (el hover de fila o abrir el panel de detalle ya calentaron el
 * detalle del cliente); es una red de seguridad barata, no el fix principal
 * del delay (ver `loadClienteDetail` usado directamente por `/pedidos`).
 */
export function warmPedidoFormAssets(clienteId: string): void {
  warmClienteDetail(clienteId)
  fetch('/api/productos/configs').catch(() => {})
  fetch('/api/precios/tabla').catch(() => {})
  void import('@/components/pedido-form-unified')
}

/** Solo para tests. */
export function __resetClienteDetailCache(): void {
  cache.clear()
}
