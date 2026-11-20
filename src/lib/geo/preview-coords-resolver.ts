import { isShortMapsUrl } from './parse-google-maps-link'
import type { ResolverCoordsDeLink } from './resolver-coords-de-link'

type Coords = NonNullable<Awaited<ReturnType<ResolverCoordsDeLink>>>
export type PreviewLinkResolver = (link: string, scope?: string) => Promise<Coords | null>

const TTL_MS = 60_000
const MAX_ENTRIES = 50
type Entry = { data?: Coords; expiresAt?: number; pending?: Promise<Coords | null> }
const copy = (coords: Coords | null): Coords | null => coords ? { ...coords } : null

/**
 * #891: memoización temporal EXCLUSIVA del preview, por instancia.
 * El caller construye scope desde actor autenticado, borrador/pedido y
 * comprador efectivo. Solo se deduplica la expansión de la misma URL corta.
 * Los repositorios se leen cada vez; commit y otros consumidores no usan esto.
 * Fallos, valores inválidos y scopes ausentes no se cachean.
 */
export function createPreviewCoordsResolver(resolve: ResolverCoordsDeLink): PreviewLinkResolver {
  const entries = new Map<string, Entry>()
  return async (link, scope) => {
    const trimmed = link.trim()
    if (!scope || !isShortMapsUrl(trimmed)) return resolve(trimmed)
    const key = JSON.stringify([scope, trimmed])
    const found = entries.get(key)
    if (found) {
      entries.delete(key)
      if (found.pending || (found.data && (found.expiresAt ?? 0) > Date.now())) {
        entries.set(key, found)
        return copy(found.pending ? await found.pending : found.data ?? null)
      }
    }
    if (entries.size >= MAX_ENTRIES) {
      const oldest = entries.keys().next().value
      if (oldest !== undefined) entries.delete(oldest)
    }
    const entry: Entry = {}
    // Inserción antes de ejecutar, incluida una posible excepción síncrona.
    const pending = Promise.resolve().then(() => resolve(trimmed)).then((coords) => {
      if (entries.get(key) === entry) {
        if (coords && Number.isFinite(coords.lat) && Math.abs(coords.lat) <= 90 &&
          Number.isFinite(coords.lng) && Math.abs(coords.lng) <= 180 && (coords.lat !== 0 || coords.lng !== 0)) {
          entry.data = { ...coords }
          entry.expiresAt = Date.now() + TTL_MS
          entry.pending = undefined
        } else entries.delete(key)
      }
      return copy(coords)
    }, (error: unknown) => {
      if (entries.get(key) === entry) entries.delete(key)
      throw error
    })
    entry.pending = pending
    entries.set(key, entry)
    return copy(await pending)
  }
}
