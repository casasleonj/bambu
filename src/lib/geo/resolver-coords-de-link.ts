import { parseGoogleMapsLink, isShortMapsUrl } from './parse-google-maps-link'
import { expandShortMapsUrl } from './expand-short-maps-url'

/**
 * `linkUbicacion → { lat, lng }` — resolución server-only (mismo patrón que
 * `backfillNegocioCoords` / `backfillClienteCoords`, extraído para que la
 * autoridad de suficiencia de entrega (`resolverEntrega`) reciba las coords
 * ya resueltas y siga siendo pura).
 *
 * 1. `parseGoogleMapsLink` directo (URLs con `/@lat,lng` o `?q=lat,lng`).
 * 2. Si es short URL (`maps.app.goo.gl` / `goo.gl`): `expandShortMapsUrl`
 *    (allowlist SSRF, tope de redirects, timeout) → parsear el resultado.
 *
 * Devuelve `null` si el link está vacío, roto, ambiguo o no resoluble.
 */
export async function resolverCoordsDeLink(
  link: string | null | undefined,
): Promise<{ lat: number; lng: number } | null> {
  const trimmed = typeof link === 'string' ? link.trim() : ''
  if (!trimmed) return null

  const directo = parseGoogleMapsLink(trimmed)
  if (directo) return { lat: directo.lat, lng: directo.lng }

  if (isShortMapsUrl(trimmed)) {
    try {
      const expanded = await expandShortMapsUrl(trimmed)
      if (expanded) {
        const parsed = parseGoogleMapsLink(expanded)
        if (parsed) return { lat: parsed.lat, lng: parsed.lng }
      }
    } catch {
      return null
    }
  }
  return null
}
